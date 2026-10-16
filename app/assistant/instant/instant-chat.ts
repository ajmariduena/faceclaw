/**
 * Instant's single chat: the last turns word for word, a summary of the older
 * ones, and the notes the user asked it to remember. Compaction runs after an
 * answer is on screen, never while the user waits.
 */

export type InstantTurn = { question: string; answer: string; atMs: number };
export type InstantChatState = { turns: InstantTurn[]; summary: string; notes: string[]; lastAtMs: number };
export type InstantChatStore = { read(): string; write(value: string): void };

export const KEPT_TURNS = 6;
export const IDLE_NEW_TOPIC_MS = 30 * 60_000;
const COMPACT_ABOVE_CHARS = 16_000;
const MAX_NOTES = 30;
const MAX_NOTE_CHARS = 200;

export class InstantChat {
  state: InstantChatState;
  private compacting = false;

  constructor(private readonly store: InstantChatStore) {
    this.state = parse(store.read());
  }

  get turns(): readonly InstantTurn[] { return this.state.turns; }
  get notes(): readonly string[] { return this.state.notes; }
  get summary(): string { return this.state.summary; }
  get lastTurn(): InstantTurn | null { return this.state.turns[this.state.turns.length - 1] ?? null; }

  /** After half an hour away the next question starts a new topic; the summary and notes stay. */
  turnsForPrompt(nowMs: number): readonly InstantTurn[] {
    return nowMs - this.state.lastAtMs > IDLE_NEW_TOPIC_MS ? [] : this.state.turns.slice(-KEPT_TURNS);
  }

  add(turn: InstantTurn): void {
    if (turn.atMs - this.state.lastAtMs > IDLE_NEW_TOPIC_MS && this.state.turns.length) {
      this.state.summary = joinSummary(this.state.summary, this.state.turns.slice(-2).map(line).join(" "));
      this.state.turns = [];
    }
    this.state.turns.push(turn);
    this.state.lastAtMs = turn.atMs;
    this.save();
  }

  remember(note: string): void {
    const text = note.trim().slice(0, MAX_NOTE_CHARS);
    if (!text || this.state.notes.includes(text)) return;
    this.state.notes.push(text);
    if (this.state.notes.length > MAX_NOTES) this.state.notes.shift();
    this.save();
  }

  forget(index: number): void {
    this.state.notes.splice(index, 1);
    this.save();
  }

  clear(): void {
    this.state.turns = [];
    this.state.summary = "";
    this.state.lastAtMs = 0;
    this.save();
  }

  needsCompaction(): boolean {
    const older = this.state.turns.slice(0, -KEPT_TURNS);
    return !this.compacting && older.length > 0 && (older.length >= KEPT_TURNS || chars(this.state.turns) > COMPACT_ABOVE_CHARS);
  }

  /** Folds every turn but the last few into the summary with `summarize`; a failure leaves the chat as it was. */
  async compact(summarize: (previous: string, transcript: string) => Promise<string>): Promise<void> {
    if (!this.needsCompaction()) return;
    this.compacting = true;
    const older = this.state.turns.slice(0, -KEPT_TURNS);
    try {
      const summary = (await summarize(this.state.summary, older.map(line).join("\n"))).trim();
      if (!summary) return;
      this.state.summary = summary;
      this.state.turns = this.state.turns.filter((turn) => !older.includes(turn));
      this.save();
    } catch { /* kept for the next try */ } finally {
      this.compacting = false;
    }
  }

  private save(): void {
    this.store.write(JSON.stringify(this.state));
  }
}

function line(turn: InstantTurn): string {
  return `User: ${turn.question}\nInstant: ${turn.answer}`;
}

function chars(turns: readonly InstantTurn[]): number {
  return turns.reduce((n, turn) => n + turn.question.length + turn.answer.length, 0);
}

function joinSummary(summary: string, extra: string): string {
  return (summary ? `${summary}\nEarlier: ${extra}` : `Earlier: ${extra}`).slice(-2000);
}

function parse(raw: string): InstantChatState {
  try {
    const value = JSON.parse(raw);
    return {
      turns: Array.isArray(value?.turns) ? value.turns.filter((t: any) => typeof t?.question === "string" && typeof t?.answer === "string") : [],
      summary: typeof value?.summary === "string" ? value.summary : "",
      notes: Array.isArray(value?.notes) ? value.notes.filter((n: unknown) => typeof n === "string") : [],
      lastAtMs: Number(value?.lastAtMs) || 0,
    };
  } catch {
    return { turns: [], summary: "", notes: [], lastAtMs: 0 };
  }
}
