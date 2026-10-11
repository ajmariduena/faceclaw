const SAMPLES_PER_BUCKET = 160; // 10 ms at 16 kHz
const BUCKETS = 3000;
const FULL_SCALE_POWER = 32768 * 32768;

/**
 * Signal power of the 16 kHz PCM sent to one recognizer session, in 10 ms
 * buckets on that session's audio clock, so a token's loudness can be read
 * back from its start_ms/end_ms. Keeps the last 30 s.
 */
export class LoudnessTimeline {
  private readonly power = new Float64Array(BUCKETS);
  private readonly counts = new Uint16Array(BUCKETS);
  private samples = 0;

  accept(pcm: Uint8Array): void {
    for (let i = 0; i + 1 < pcm.length; i += 2) {
      const bucket = Math.floor(this.samples / SAMPLES_PER_BUCKET) % BUCKETS;
      if (this.samples % SAMPLES_PER_BUCKET === 0) {
        this.power[bucket] = 0;
        this.counts[bucket] = 0;
      }
      const sample = ((pcm[i]! | (pcm[i + 1]! << 8)) << 16) >> 16;
      this.power[bucket] += sample * sample;
      this.counts[bucket]++;
      this.samples++;
    }
  }

  /** Mean level of [startMs, endMs] in dBFS, or undefined when that audio is gone or not sent yet. */
  loudnessDb(startMs: number, endMs: number): number | undefined {
    const sent = Math.ceil(this.samples / SAMPLES_PER_BUCKET);
    const start = Math.floor(startMs / 10);
    const first = Math.max(start, sent - BUCKETS, 0);
    const last = Math.min(Math.max(Math.ceil(endMs / 10), start + 1), sent);
    let power = 0;
    let count = 0;
    for (let bucket = first; bucket < last; bucket++) {
      power += this.power[bucket % BUCKETS]!;
      count += this.counts[bucket % BUCKETS]!;
    }
    if (!count) return undefined;
    return Math.round(100 * Math.log10(Math.max(power / count, 1) / FULL_SCALE_POWER)) / 10;
  }
}
