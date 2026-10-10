import type { SonioxToken } from "../../native/soniox-stt";

/**
 * Soniox two-way translation responses folded into segments: what was said
 * (the original, in its language) and its translation. Final tokens arrive
 * once and accumulate; non-final ones are re-sent, revised, in every
 * response and only ever extend the newest segment for display. A segment
 * closes at an endpoint marker or when the spoken language changes.
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
};

const MAX_SEGMENTS = 60;

type Open = { original: string; translation: string; language: string; translated: boolean };

export class TranslationTranscript {
  private readonly closed: Open[] = [];
  private current: Open = empty();
  private liveOriginal = "";
  private liveLanguage = "";
  /** Non-final translation, and whether it belongs to the last closed segment rather than the open one. */
  private liveTranslation = "";
  private liveTranslationClosed = false;
  /** When a spoken (not translated) token last arrived, for the silence auto-stop. */
  lastSpeechAtMs = 0;

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
        continue;
      }
      const language = token.language ?? "";
      if (language && this.current.language && language !== this.current.language && this.current.original.trim()) this.close();
      this.current.original += text;
      if (language) this.current.language = language;
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
    if (!this.current.original.trim() && !this.current.translation.trim()) {
      this.current = empty();
      return false;
    }
    this.closed.push(this.current);
    if (this.closed.length > MAX_SEGMENTS) this.closed.splice(0, this.closed.length - MAX_SEGMENTS);
    this.current = empty();
    return true;
  }

  /** Drop the non-final tail (its session is gone; Soniox will not finalize it). */
  dropLive(): void {
    this.liveOriginal = "";
    this.liveLanguage = "";
    this.liveTranslation = "";
    this.liveTranslationClosed = false;
  }

  segments(): TranslateSegment[] {
    const segments = this.closed.map((segment) => ({ ...clean(segment), closed: true }));
    if (this.liveTranslationClosed && segments.length) {
      const last = this.closed[this.closed.length - 1]!;
      segments[segments.length - 1] = { ...clean({ ...last, translation: last.translation + this.liveTranslation }), closed: true };
    }
    const open: Open = {
      original: this.current.original + this.liveOriginal,
      translation: this.current.translation + (this.liveTranslationClosed ? "" : this.liveTranslation),
      language: this.current.language || this.liveLanguage,
      translated: this.current.translated,
    };
    if (open.original.trim() || open.translation.trim()) segments.push({ ...clean(open), closed: false });
    return segments;
  }
}

function empty(): Open {
  return { original: "", translation: "", language: "", translated: false };
}

function clean(segment: Open): Omit<TranslateSegment, "closed"> {
  return {
    original: segment.original.replace(/\s+/g, " ").trim(),
    translation: segment.translation.replace(/\s+/g, " ").trim(),
    language: segment.language,
    translated: segment.translated || segment.translation.trim() !== "",
  };
}

/** "0:42", "12:05", "1:02:03". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
