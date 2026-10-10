/**
 * What the home's Paseo card shows: a verdict ("1 needs you", "Nothing needs
 * you", "All done"), the agent that justifies it, and a dim ledger of the
 * other buckets (research/paseo-card-fable.md). The Paseo worker builds it
 * from its live connection and publishes it through the host's worker-state
 * channel; the home paints it on the main thread. Plain JSON (it crosses
 * postMessage) with timestamps rather than formatted ages.
 *
 * No NativeScript imports: bundled into the worker as well.
 */
import { agentActivityMs, agentTitle, BUCKET_ORDER, formatAge, sectionAgents, type AgentSnapshot, type Bucket } from "./paseo-model";

export const PASEO_GLANCE_STATE_KEY = "paseo:glance";

/** How many updates the snapshot carries; the first is the card's lead agent. */
export const GLANCE_UPDATES = 2;

/** Buckets that make the card say the user should go in; a tap then opens that agent. */
export const URGENT_BUCKETS: readonly Bucket[] = ["needs", "failed", "review"];

export type BucketCounts = Record<Bucket, number>;

/** Done agents count toward the card only this long after their last activity. */
export const GLANCE_DONE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PaseoGlanceUpdate = {
  agentId: string;
  title: string;
  bucket: Bucket;
  /** Last activity, epoch ms (daemon clock). */
  activityMs: number;
  /** The agent's latest line for the glasses (summary, fallback or the pending question); "" while unknown. */
  line: string;
};

export type PaseoGlanceSnapshot = {
  /** A pairing is stored. */
  configured: boolean;
  /** Why there is nothing to show ("Connecting…", ...); "" while connected. */
  status: string;
  /** Most urgent bucket first, then the most recent activity. */
  updates: PaseoGlanceUpdate[];
  counts: BucketCounts;
  needs: number;
  working: number;
  /** While disconnected: when the last connected snapshot was built, and its counts. */
  lastSeenMs: number | null;
  lastCounts: BucketCounts | null;
};

export function emptyCounts(): BucketCounts {
  return { needs: 0, failed: 0, review: 0, working: 0, done: 0 };
}

export function buildGlanceSnapshot(
  state: { configured: boolean; connected: boolean; status: string; lastGood?: { counts: BucketCounts; atMs: number } | null },
  agents: Iterable<AgentSnapshot>,
  lineFor: (agent: AgentSnapshot) => string,
  nowMs = Date.now(),
): PaseoGlanceSnapshot {
  const idle = { updates: [], counts: emptyCounts(), needs: 0, working: 0, lastSeenMs: null, lastCounts: null };
  if (!state.configured) return { configured: false, status: "", ...idle };
  if (!state.connected) {
    return { configured: true, status: state.status || "Mac unreachable", ...idle,
      lastSeenMs: state.lastGood?.atMs ?? null, lastCounts: state.lastGood?.counts ?? null };
  }
  const sections = sectionAgents(agents);
  const listed = sections.flatMap((section) => section.agents.map((agent) => ({ agent, bucket: section.bucket })));
  listed.sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket)
    || agentActivityMs(b.agent) - agentActivityMs(a.agent));
  const counts = emptyCounts();
  for (const { agent, bucket } of listed) {
    if (bucket !== "done" || nowMs - agentActivityMs(agent) <= GLANCE_DONE_WINDOW_MS) counts[bucket]++;
  }
  return {
    configured: true,
    status: "",
    updates: listed.slice(0, GLANCE_UPDATES).map(({ agent, bucket }) => ({
      agentId: agent.id,
      title: agentTitle(agent),
      bucket,
      activityMs: agentActivityMs(agent),
      line: lineFor(agent),
    })),
    counts,
    needs: counts.needs,
    working: counts.working,
    lastSeenMs: null,
    lastCounts: null,
  };
}

const LEDGER_WORDS: Record<Bucket, string> = { needs: "needs you", failed: "failed", review: "to review", working: "working", done: "done" };

function ledger(counts: BucketCounts, skip: Bucket | null): string {
  return BUCKET_ORDER.filter((bucket) => counts[bucket] > 0 && bucket !== skip)
    .map((bucket) => `${counts[bucket]} ${LEDGER_WORDS[bucket]}`).join(" · ");
}

function ago(thenMs: number, nowMs: number): string {
  const age = formatAge(thenMs, nowMs);
  return age === "now" ? "just now" : `${age} ago`;
}

export type GlanceVerdict = {
  /** White, first row. */
  verdict: string;
  /** The agent that justifies the verdict (title dim, line white). */
  lead: PaseoGlanceUpdate | null;
  /** Dim line under the verdict when there is no lead ("Last seen 29 min ago"). */
  note: string;
  /** Dim, last row. */
  ledger: string;
};

/** The connected or unreachable card; null when the card shows a centred status instead (not paired, connecting). */
export function glanceVerdict(snapshot: PaseoGlanceSnapshot | null | undefined, nowMs: number): GlanceVerdict | null {
  if (!snapshot?.configured) return null;
  if (snapshot.status) {
    if (typeof snapshot.lastSeenMs !== "number") return null;
    const was = snapshot.lastCounts ? ledger(snapshot.lastCounts, "done") : "";
    return { verdict: snapshot.status, lead: null, note: `Last seen ${ago(snapshot.lastSeenMs, nowMs)}`, ledger: was ? `Was: ${was}` : "" };
  }
  const counts = snapshot.counts ?? { ...emptyCounts(), needs: snapshot.needs, working: snapshot.working };
  const lead = snapshot.updates[0] ?? null;
  if (counts.needs) return { verdict: `${counts.needs} need${counts.needs === 1 ? "s" : ""} you`, lead, note: "", ledger: ledger(counts, "needs") };
  if (counts.failed) return { verdict: `${counts.failed} failed`, lead, note: "", ledger: ledger(counts, "failed") };
  if (counts.review) return { verdict: `${counts.review} to review`, lead, note: "", ledger: ledger(counts, "review") };
  if (counts.working) return { verdict: "Nothing needs you", lead, note: "", ledger: ledger(counts, null) };
  if (counts.done && lead) {
    const age = formatAge(lead.activityMs, nowMs);
    return { verdict: "All done", lead, note: "", ledger: `${counts.done} finished · ${age === "now" ? "just now" : `last ${age}`}` };
  }
  return { verdict: lead ? "All quiet" : "No agents", lead: null, note: "", ledger: "" };
}

/** The agent a tap on the card should open: the lead, when the verdict asks the user to go in. */
export function glanceUrgentAgent(snapshot: PaseoGlanceSnapshot | null | undefined): string | null {
  const lead = snapshot?.status ? null : snapshot?.updates[0];
  return lead && URGENT_BUCKETS.includes(lead.bucket) ? lead.agentId : null;
}

/** "Fix reconnect BLE · 1 min" */
export function glanceWhoLine(update: PaseoGlanceUpdate, nowMs: number): string {
  return `${update.title} · ${formatAge(update.activityMs, nowMs)}`;
}

/** The card's centred status when it has no updates to show. */
export function glanceEmptyStatus(snapshot: PaseoGlanceSnapshot | null | undefined): string {
  if (!snapshot || !snapshot.configured) return "Not paired";
  if (snapshot.status) return snapshot.status;
  return "No updates";
}
