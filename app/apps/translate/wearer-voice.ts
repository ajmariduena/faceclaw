/**
 * Which diarized speaker is the wearer, from loudness alone: the glasses
 * mics sit a few centimetres from the wearer's mouth and a metre or more
 * from anyone else, so the wearer's speech arrives far louder. Soniox
 * speaker labels are per recognizer session, so levels are kept per session;
 * once a session has told the two apart, their levels decide for later
 * sessions that have heard only one voice so far.
 */
export const WEARER_MARGIN_DB = 10;
const MIN_TOKENS = 4;
const WINDOW = 40;
const MAX_SESSIONS = 20;

export type WearerCalibration = { wearerDb: number; othersDb: number };

export class WearerVoice {
  private readonly sessions = new Map<number, Map<string, number[]>>();

  constructor(private calibration: WearerCalibration | null = null) {}

  get learned(): WearerCalibration | null {
    return this.calibration;
  }

  hear(session: number, speaker: string, loudness: number): void {
    let speakers = this.sessions.get(session);
    if (!speakers) {
      speakers = new Map();
      this.sessions.set(session, speakers);
      for (const old of this.sessions.keys()) if (this.sessions.size > MAX_SESSIONS) this.sessions.delete(old);
    }
    const levels = speakers.get(speaker) ?? [];
    levels.push(loudness);
    if (levels.length > WINDOW) levels.shift();
    speakers.set(speaker, levels);
  }

  /** Median dBFS of `speaker` in `session`, once enough of their words were heard. */
  level(session: number, speaker: string): number | undefined {
    const levels = this.sessions.get(session)?.get(speaker);
    return levels && levels.length >= MIN_TOKENS ? median(levels) : undefined;
  }

  isWearer(session: number, speaker: string): boolean {
    if (!speaker) return false;
    const own = this.level(session, speaker);
    if (own === undefined) return false;
    let quietest = Infinity;
    for (const other of this.sessions.get(session)!.keys()) {
      if (other !== speaker) quietest = Math.min(quietest, this.level(session, other) ?? Infinity);
    }
    if (quietest !== Infinity) {
      if (own - quietest < WEARER_MARGIN_DB) return false;
      this.calibration = { wearerDb: own, othersDb: quietest };
      return true;
    }
    return this.calibration !== null && own >= (this.calibration.wearerDb + this.calibration.othersDb) / 2;
  }
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
