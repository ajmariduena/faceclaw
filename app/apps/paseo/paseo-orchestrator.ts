/**
 * The conversation with the daemon's voice orchestrator, in its "messages"
 * mode: the glasses send each dictated utterance as text and read back the
 * numbered items the daemon queues (what it heard, its replies, narrated
 * notices about agents, coded statuses).
 */
import type { ChatLine } from "../../graphics/terminal-painter";

export const ORCHESTRATOR_KEY = "orchestrator";
export const ORCHESTRATOR_TITLE = "Orchestrator";
/** Lines handed back to the daemon when a call has to start again (its own HISTORY_LIMIT). */
const HISTORY_LINES = 24;
const MAX_ITEMS = 200;
/** A reply that never came stops the "Thinking" clock after this long. */
const THINKING_MAX_MS = 120_000;

export type OrchestratorItem = {
  seq: number;
  kind: string;
  text: string;
  code: string | null;
  utteranceId: string | null;
};

/** Local echoes of what was said carry no seq until the daemon's "heard" item replaces them. */
const LOCAL_SEQ = 0;

export class OrchestratorConversation {
  readonly items: OrchestratorItem[] = [];
  /** The daemon's seq for this call: what sync asks after. */
  lastSeq = 0;
  /** A restarted call numbers from 1 again; stored seqs are shifted past the old call's. */
  private base = 0;
  /** Utterances sent and not yet answered by a reply or a status. */
  readonly pending = new Map<string, number>();

  /** Insert or replace by seq; a "heard" item also replaces the local echo of its utterance. Returns whether anything changed. */
  upsert(incoming: OrchestratorItem): boolean {
    if (incoming.seq > this.lastSeq) this.lastSeq = incoming.seq;
    const item = { ...incoming, seq: this.base + incoming.seq };
    if (item.utteranceId && (item.kind === "reply" || item.kind === "status")) this.pending.delete(item.utteranceId);
    const existing = this.items.findIndex((entry) => entry.seq === item.seq && item.seq !== LOCAL_SEQ);
    if (existing >= 0) {
      if (this.items[existing]!.text === item.text && this.items[existing]!.kind === item.kind) return false;
      this.items[existing] = item;
      return true;
    }
    if (item.kind === "heard" && item.utteranceId) {
      const echo = this.items.findIndex((entry) => entry.seq === LOCAL_SEQ && entry.utteranceId === item.utteranceId);
      if (echo >= 0) {
        this.items[echo] = item;
        return true;
      }
    }
    const at = this.items.findIndex((entry) => entry.seq !== LOCAL_SEQ && entry.seq > item.seq);
    if (at < 0) this.items.push(item);
    else this.items.splice(at, 0, item);
    if (this.items.length > MAX_ITEMS) this.items.splice(0, this.items.length - MAX_ITEMS);
    return true;
  }

  /** The daemon lost the call and a new one starts: keep what was said, number the new call's items after it. */
  restart(): void {
    this.base = this.items.reduce((max, entry) => Math.max(max, entry.seq), this.base);
    this.lastSeq = 0;
  }

  said(utteranceId: string, text: string, nowMs: number): void {
    this.items.push({ seq: LOCAL_SEQ, kind: "heard", text, code: null, utteranceId });
    this.pending.set(utteranceId, nowMs);
  }

  forget(utteranceId: string): void {
    this.pending.delete(utteranceId);
    const echo = this.items.findIndex((entry) => entry.seq === LOCAL_SEQ && entry.utteranceId === utteranceId);
    if (echo >= 0) this.items.splice(echo, 1);
  }

  /** When the oldest unanswered utterance went out, for the "Thinking" clock. */
  thinkingSince(nowMs: number): number | null {
    let oldest: number | null = null;
    for (const sentMs of this.pending.values()) {
      if (nowMs - sentMs > THINKING_MAX_MS) continue;
      if (oldest === null || sentMs < oldest) oldest = sentMs;
    }
    return oldest;
  }

  lines(): ChatLine[] {
    const lines: ChatLine[] = [];
    for (const item of this.items) {
      if (item.kind === "heard" && item.text.trim()) lines.push({ role: "user", text: item.text.trim() });
      else if (item.kind === "reply" && item.text.trim()) lines.push({ role: "assistant", text: sentencePerLine(item.text) });
      else if (item.kind === "notice" && item.text.trim()) lines.push({ role: "assistant", text: sentencePerLine(item.text), action: true });
    }
    return lines;
  }

  /** "User: …" / "Assistant: …" lines, the shape the daemon keeps for its own history. */
  history(): string[] {
    const lines: string[] = [];
    for (const item of this.items) {
      if (item.seq === LOCAL_SEQ) continue;
      if (item.kind === "heard" && item.text.trim()) lines.push(`User: ${item.text.trim()}`);
      else if ((item.kind === "reply" || item.kind === "notice") && item.text.trim()) lines.push(`Assistant: ${item.text.trim()}`);
    }
    return lines.slice(-HISTORY_LINES);
  }
}

export function sentencePerLine(text: string): string {
  return text
    .trim()
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?…])\s+/))
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function parseOrchestratorItem(raw: any): OrchestratorItem | null {
  if (!raw || typeof raw.seq !== "number" || typeof raw.kind !== "string") return null;
  return {
    seq: raw.seq,
    kind: raw.kind,
    text: typeof raw.text === "string" ? raw.text : "",
    code: typeof raw.code === "string" ? raw.code : null,
    utteranceId: typeof raw.utteranceId === "string" ? raw.utteranceId : null,
  };
}

export function statusText(code: string | null): string {
  if (code === "not_heard") return "Nothing heard.";
  if (code === "backend_failed") return "Couldn't answer that. Try again.";
  return code ?? "";
}
