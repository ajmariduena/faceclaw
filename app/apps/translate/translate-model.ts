import type { SonioxToken } from "../../native/soniox-stt";
import { WearerVoice, median } from "./wearer-voice";

/**
 * Soniox two-way translation responses folded into segments: what was said
 * (the original, in its language) and its translation. Final tokens arrive
 * once and accumulate; non-final ones are re-sent, revised, in every
 * response and only ever extend the newest segment for display. A segment
 * closes at an endpoint marker or when the speaker or spoken language
 * changes. Segments spoken by the wearer (wearer-voice.ts) are left out.
 */
export type TranslateSegment = {
  original: string;
  translation: string;
  /** Language of the original ("es", "en"), when Soniox reported it. */
  language: string;
  /** False for speech outside the language pair, which Soniox only transcribes. */
  translated: boolean;
  /** The speech is complete; a lagging translation may still extend it. */
  closed: boolean;
  /** Length of the final prefix of `translation`; the rest is non-final and may still be revised. */
  settled: number;
};

const MAX_SEGMENTS = 60;

type Open = { original: string; translation: string; language: string; translated: boolean; session: number; speaker: string; levels: number[] };

let nextSession = 0;

export class TranslationTranscript {
  private readonly closed: Open[] = [];
  private session = ++nextSession;
  private current: Open = empty(this.session);
  private liveOriginal = "";
  private liveLanguage = "";
  private liveSpeaker = "";
  /** Non-final translation, and whether it belongs to the last closed segment rather than the open one. */
  private liveTranslation = "";
  private liveTranslationClosed = false;
  /** When a spoken (not translated) token last arrived, for the silence auto-stop. */
  lastSpeechAtMs = 0;

  constructor(private readonly voice = new WearerVoice()) {}

  /** Fold one response's tokens in; returns whether anything visible changed. */
  accept(tokens: readonly SonioxToken[], nowMs: number): boolean {
    let changed = this.liveOriginal !== "" || this.liveTranslation !== "";
    this.dropLive();
    for (const token of tokens) {
      const text = String(token?.text ?? "");
      if (!text) continue;
      if (text === "<end>" || text === "<fin>") {
        if (token.is_final) changed = this.close() || changed;
        continue;
      }
      const status = token.translation_status ?? "none";
      if (status !== "translation" && text.trim()) this.lastSpeechAtMs = nowMs;
      changed = true;
      if (status === "translation") {
        const target = this.translationTarget(token.source_language ?? "");
        if (token.is_final) {
          target.translation += text;
          target.translated = true;
        } else {
          this.liveTranslation += text;
          this.liveTranslationClosed = target !== this.current;
        }
        continue;
      }
      if (!token.is_final) {
        this.liveOriginal += text;
        this.liveLanguage ||= token.language ?? "";
        this.liveSpeaker ||= token.speaker ?? "";
        continue;
      }
      const language = token.language ?? "";
      const speaker = token.speaker ?? "";
      const switched = (language && this.current.language && language !== this.current.language)
        || (speaker && this.current.speaker && speaker !== this.current.speaker);
      if (switched && this.current.original.trim()) this.close();
      this.current.original += text;
      if (language) this.current.language = language;
      if (speaker) this.current.speaker = speaker;
      if (speaker && typeof token.loudness === "number" && text.trim()) {
        this.voice.hear(this.session, speaker, token.loudness);
        this.current.levels.push(token.loudness);
      }
      if (status === "original") this.current.translated = true;
    }
    return changed;
  }

  /**
   * Translation lags its speech, so it can arrive after an endpoint or a
   * switch of speaker already closed its segment: Soniox tags it with the
   * language it was translated from.
   */
  private translationTarget(source: string): Open {
    const last = this.closed[this.closed.length - 1];
    if (source && this.current.language !== source && last?.language === source) return last;
    return this.current;
  }

  /** End the open segment (endpoint, pause, session restart). */
  close(): boolean {
    const segment = this.current;
    this.current = empty(this.session);
    if (!segment.original.trim() && !segment.translation.trim()) return false;
    this.closed.push(segment);
    if (this.closed.length > MAX_SEGMENTS) this.closed.splice(0, this.closed.length - MAX_SEGMENTS);
    if (segment.levels.length) {
      const level = this.voice.level(segment.session, segment.speaker);
      console.log(`Translate: speaker ${segment.speaker} said ${segment.levels.length} words at ${median(segment.levels)} dBFS (speaker ${level ?? "?"} dBFS, wearer ${this.isWearer(segment)})`);
    }
    return true;
  }

  /** A new recognizer session: its speaker labels start over. */
  newSession(): void {
    this.dropLive();
    this.close();
    this.session = ++nextSession;
    this.current = empty(this.session);
  }

  /** Drop the non-final tail (its session is gone; Soniox will not finalize it). */
  dropLive(): void {
    this.liveOriginal = "";
    this.liveLanguage = "";
    this.liveSpeaker = "";
    this.liveTranslation = "";
    this.liveTranslationClosed = false;
  }

  /** What others said, oldest first. */
  segments(): TranslateSegment[] {
    const segments: TranslateSegment[] = [];
    this.closed.forEach((segment, index) => {
      if (this.isWearer(segment)) return;
      const live = this.liveTranslationClosed && index === this.closed.length - 1 ? this.liveTranslation : "";
      segments.push(withSettled({ ...segment, translation: segment.translation + live }, segment.translation, true));
    });
    const open: Open = {
      ...this.current,
      original: this.current.original + this.liveOriginal,
      translation: this.current.translation + (this.liveTranslationClosed ? "" : this.liveTranslation),
      language: this.current.language || this.liveLanguage,
      speaker: this.current.speaker || this.liveSpeaker,
    };
    if ((open.original.trim() || open.translation.trim()) && !this.isWearer(open)) segments.push(withSettled(open, this.current.translation, false));
    return segments;
  }

  private isWearer(segment: Open): boolean {
    return this.voice.isWearer(segment.session, segment.speaker);
  }
}

function empty(session: number): Open {
  return { original: "", translation: "", language: "", translated: false, session, speaker: "", levels: [] };
}


function clean(segment: Open): Omit<TranslateSegment, "closed" | "settled"> {
  return {
    original: segment.original.replace(/\s+/g, " ").trim(),
    translation: segment.translation.replace(/\s+/g, " ").trim(),
    language: segment.language,
    translated: segment.translated || segment.translation.trim() !== "",
  };
}

function withSettled(segment: Open, settledTranslation: string, closed: boolean): TranslateSegment {
  const cleaned = clean(segment);
  const settled = settledTranslation.replace(/\s+/g, " ").trim();
  return { ...cleaned, closed, settled: cleaned.translation.startsWith(settled) ? settled.length : 0 };
}
