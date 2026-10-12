import type { TurnOutcome } from "../../assistant/instant/instant-turn";
import { writeTextToDownloads } from "../../native/file-access";

type Entry = { at: string; question: string; answer: string; route: string; winner?: string; tools: string[]; firstMs: number; totalMs: number };

/**
 * Every Instant question with its timings, one JSON line each, in
 * Download/faceclaw-instant-<start>.jsonl, so the latency can be read off
 * real use. A new file starts each time the app is opened.
 */
export class InstantLog {
  private readonly entries: Entry[] = [];
  private fileName = "";

  add(question: string, outcome: TurnOutcome, heardAtMs: number): void {
    const at = new Date(heardAtMs);
    if (!this.fileName) this.fileName = `faceclaw-instant-${stamp(at)}.jsonl`;
    this.entries.push({ at: at.toISOString(), question, answer: outcome.answer, route: outcome.route, winner: outcome.winner, tools: outcome.tools, firstMs: outcome.firstMs, totalMs: outcome.totalMs });
    writeTextToDownloads(this.fileName, this.entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  }
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
