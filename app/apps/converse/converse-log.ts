import { writeTextToDownloads } from "../../native/file-access";
import type { Fact } from "./converse-facts";

type Entry = { at: string; language: string; said: string; fact?: Fact | null; ms?: number };

/**
 * Every heard sentence and the fact its lookup returned, one JSON line each,
 * in Download/faceclaw-converse-<start>.jsonl. A fact can still lose to a later
 * sentence's on the glasses. A new file starts each time the app is opened.
 */
export class ConverseLog {
  private readonly entries: Entry[] = [];
  private fileName = "";

  sentence(said: string, language: string): (fact: Fact | null) => void {
    const now = new Date();
    if (!this.fileName) this.fileName = `faceclaw-converse-${stamp(now)}.jsonl`;
    const entry: Entry = { at: now.toISOString(), language, said };
    this.entries.push(entry);
    this.save();
    return (fact) => {
      entry.fact = fact;
      entry.ms = Date.now() - now.getTime();
      this.save();
    };
  }

  private save(): void {
    writeTextToDownloads(this.fileName, this.entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  }
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
