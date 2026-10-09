/**
 * The Paseo app's view of the daemon's data: which agents the glasses list
 * and in which sidebar bucket, the chat entries a timeline reduces to (the
 * user's messages and the agent's replies, nothing else), the one-line
 * fallback shown until the daemon's glance summary arrives, and the window
 * of whole messages that fits above the footer.
 *
 * No NativeScript imports: shared by the worker, the home card and tests.
 */

export type AgentStatus = "initializing" | "idle" | "running" | "error" | "closed";

export type PermissionRequest = {
  id: string;
  kind: string;
  name: string;
  title?: string | null;
  input?: unknown;
  detail?: unknown;
  /** Provider-suggested permission rules (Claude Code's "always allow" shape). */
  suggestions?: unknown[];
};

export type AgentSnapshot = {
  id: string;
  title: string | null;
  provider?: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
  activeTurn?: { turnId: string; startedAt: string | null } | null;
  pendingPermissions?: PermissionRequest[];
  requiresAttention?: boolean;
  attentionReason?: "finished" | "error" | "permission" | null;
  archivedAt?: string | null;
  labels?: Record<string, string>;
  lastError?: string;
};

export type Bucket = "needs" | "failed" | "review" | "working" | "done";

export const BUCKET_ORDER: readonly Bucket[] = ["needs", "failed", "review", "working", "done"];

export const BUCKET_LABELS: Record<Bucket, string> = {
  needs: "Needs input",
  failed: "Failed",
  review: "Ready to review",
  working: "Working",
  done: "Done",
};

/** Label the agent's parent sets on subagents it spawns. */
export const PARENT_AGENT_LABEL = "paseo.parent-agent-id";

export function agentBucket(agent: AgentSnapshot): Bucket {
  if (agent.pendingPermissions?.length) return "needs";
  if (agent.status === "error") return "failed";
  if (agent.requiresAttention && agent.status !== "running") return "review";
  if (agent.status === "running") return "working";
  return "done";
}

/** Top-level, live agents only: no subagents, nothing archived or closed. */
export function isListedAgent(agent: AgentSnapshot): boolean {
  if (agent.archivedAt) return false;
  if (agent.status === "closed") return false;
  if (agent.labels?.[PARENT_AGENT_LABEL]) return false;
  return true;
}

export function agentActivityMs(agent: AgentSnapshot): number {
  return Date.parse(agent.updatedAt) || Date.parse(agent.createdAt) || 0;
}

export function agentTitle(agent: AgentSnapshot): string {
  return (agent.title ?? "").replace(/\s+/g, " ").trim() || "Untitled";
}

export type AgentSection = { bucket: Bucket; label: string; agents: AgentSnapshot[] };

/** Listed agents in sidebar order, non-empty buckets only, newest activity first within each. */
export function sectionAgents(agents: Iterable<AgentSnapshot>): AgentSection[] {
  const byBucket = new Map<Bucket, AgentSnapshot[]>();
  for (const agent of agents) {
    if (!isListedAgent(agent)) continue;
    const bucket = agentBucket(agent);
    let list = byBucket.get(bucket);
    if (!list) byBucket.set(bucket, (list = []));
    list.push(agent);
  }
  const sections: AgentSection[] = [];
  for (const bucket of BUCKET_ORDER) {
    const list = byBucket.get(bucket);
    if (!list?.length) continue;
    list.sort((a, b) => agentActivityMs(b) - agentActivityMs(a) || agentTitle(a).localeCompare(agentTitle(b)));
    sections.push({ bucket, label: BUCKET_LABELS[bucket], agents: list });
  }
  return sections;
}

/** "1 needs · 2 ready · 2 working · 14 done" (first word of each non-empty bucket). */
export function sectionCounts(sections: readonly AgentSection[]): string {
  return sections.map((section) => `${section.agents.length} ${section.label.split(" ")[0]!.toLowerCase()}`).join(" · ");
}

/** "now", "1 min", "4 min", "2 h", "3 d". */
export function formatAge(thenMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (seconds < 45) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

/** "12s", "1m", "2m 14s" style for the chat footer. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** "0:04" for the listening footer. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Chat entries

export type ChatEntry = {
  /** Stable per message (its messageId, else its timeline position). */
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type TimelineEntryLike = {
  item?: { type?: string; text?: string; messageId?: string; clientMessageId?: string; [key: string]: unknown } | null;
  seqStart?: number;
  seq?: number;
  [key: string]: unknown;
};

/** The user's messages and the agent's replies, in order; tool steps, reasoning and the rest drop out. */
export function chatEntryFromTimeline(entry: TimelineEntryLike): ChatEntry | null {
  const item = entry.item;
  if (!item || (item.type !== "user_message" && item.type !== "assistant_message")) return null;
  const text = typeof item.text === "string" ? item.text.trim() : "";
  if (!text) return null;
  const seq = typeof entry.seqStart === "number" ? entry.seqStart : typeof entry.seq === "number" ? entry.seq : null;
  const id = item.messageId || item.clientMessageId || (seq !== null ? `seq:${seq}` : `text:${text.slice(0, 40)}`);
  return { id, role: item.type === "user_message" ? "user" : "assistant", text };
}

export function chatEntries(entries: readonly TimelineEntryLike[]): ChatEntry[] {
  const result: ChatEntry[] = [];
  for (const entry of entries) {
    const chat = chatEntryFromTimeline(entry);
    if (chat) upsertEntry(result, chat);
  }
  return result;
}

/** Replace the entry with the same id (a re-emitted message) or append. */
export function upsertEntry(entries: ChatEntry[], entry: ChatEntry): boolean {
  const index = entries.findIndex((candidate) => candidate.id === entry.id);
  if (index < 0) {
    entries.push(entry);
    return true;
  }
  if (entries[index]!.text === entry.text && entries[index]!.role === entry.role) return false;
  entries[index] = entry;
  return true;
}

/** Light Markdown cleanup for one-line display. */
export function plainText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The line shown until the daemon's glance summary arrives (or when the
 * daemon can't summarize): the first sentence, which the painter trims to
 * two lines.
 */
export function fallbackLine(text: string): string {
  const plain = plainText(text);
  if (!plain) return "";
  const match = /^(.{12,}?[.!?])(\s|$)/.exec(plain);
  return (match ? match[1]! : plain).trim();
}

// ---------------------------------------------------------------------------
// Windowing

export type Block = { height: number };

/**
 * Which whole blocks fit in `available` pixels, newest first, with
 * `scrollBack` blocks skipped from the end (ring scroll reading back).
 * Returns the index range [first, end) and how far back scrolling can go
 * while still showing at least one block.
 */
export function windowBlocks(blocks: readonly Block[], available: number, gap: number, scrollBack: number): { first: number; end: number; maxScrollBack: number } {
  const maxScrollBack = Math.max(0, blocks.length - 1);
  const end = blocks.length - Math.min(Math.max(0, scrollBack), maxScrollBack);
  let first = end;
  let used = 0;
  while (first > 0) {
    const height = blocks[first - 1]!.height + (first < end ? gap : 0);
    if (used + height > available && first < end) break;
    used += height;
    first--;
  }
  return { first, end, maxScrollBack };
}
