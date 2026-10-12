import type { CloudSttClient, CloudSttOptions } from "../../native/cloud-stt";
import { ReconnectingSttClient } from "../../native/reconnecting-stt";
import { SonioxSttClient, type SonioxSttOptions } from "../../native/soniox-stt";
import { voiceControlBridge } from "../../native/voice-control";
import { sonioxApiKeySetting } from "../../ui/dashboard-settings";
import { voiceActivity } from "../../ui/shell/voice-activity";
import { activeCommunicator } from "../evenhub/mic-router";
import { describeFailure } from "../translate/translate-session";
import type { Fact, FactContext, FactKeys } from "./converse-facts";
import { converseKeys, missingConverseKey } from "./converse-keys";

export type ConverseState =
  | { kind: "connecting" }
  | { kind: "listening" }
  | { kind: "reconnecting" }
  | { kind: "paused" }
  | { kind: "missing-key"; service: string }
  | { kind: "no-glasses" }
  | { kind: "mic-busy" }
  | { kind: "failed"; message: string };

export type FactLookup = (sentence: string, language: string, keys: FactKeys, context: FactContext) => Promise<Fact | null>;

export const SILENCE_AUTO_STOP_MS = 3 * 60_000;
/** A fragment that ends unfinished waits this long for the rest of the sentence. */
export const UNFINISHED_HOLD_MS = 8000;
const KEPT_SENTENCES = 200;
const KEPT_FACTS = 10;

/**
 * Live facts: the glasses mic into a Soniox ES/EN session through the shared
 * raw-PCM tap (as Translate does), and every finished sentence into a fact
 * lookup. A slower lookup never replaces the fact of a later sentence.
 */
export class ConverseSession {
  state: ConverseState = { kind: "paused" };
  fact: Fact | null = null;
  /** The fact the newest one replaced, still shown dimmer under it. */
  previous: Fact | null = null;
  /** Every finished sentence since the app opened; pausing keeps it, leaving clears it. */
  readonly transcript: string[] = [];
  private readonly shownFacts: string[] = [];
  private client: CloudSttClient | null = null;
  private offPcm: (() => void) | null = null;
  private offVoiceActivity: (() => void) | null = null;
  private language = "es";
  private heardCount = 0;
  private shownIndex = 0;
  private lastSpeechAtMs = 0;
  private held: { text: string; sinceMs: number; keys: FactKeys } | null = null;

  constructor(
    private readonly onChange: () => void,
    private readonly lookup: FactLookup,
  ) {}

  get listening(): boolean {
    return this.state.kind === "connecting" || this.state.kind === "listening" || this.state.kind === "reconnecting";
  }

  start(): void {
    if (this.listening) return;
    const apiKey = sonioxApiKeySetting.get().trim();
    const keys = converseKeys();
    const missing = missingConverseKey(apiKey, keys);
    if (missing) return this.setState({ kind: "missing-key", service: missing });
    const communicator = activeCommunicator();
    if (!communicator) return this.setState({ kind: "no-glasses" });
    this.offPcm = voiceControlBridge.onRawPcm((pcm) => this.client?.acceptPcm(pcm));
    if (!voiceControlBridge.startRawCapture({ communicator })) {
      this.releaseMic();
      return this.setState({ kind: "mic-busy" });
    }
    this.offVoiceActivity = voiceActivity.subscribe((active) => {
      if (!active && this.listening) voiceControlBridge.startRawCapture({ communicator: activeCommunicator() });
    });
    let client: CloudSttClient | null = null;
    const options: SonioxSttOptions = {
      apiKey,
      languageHints: ["es", "en"],
      endpoint: { sensitivity: -0.5, maxDelayMs: 3000 },
      onTokens: (tokens) => {
        if (client !== this.client) return;
        this.lastSpeechAtMs = Date.now();
        const spoken = tokens.find((token) => token.is_final && token.language);
        if (spoken?.language) this.language = spoken.language;
      },
      onTranscript: (event) => {
        if (client === this.client && event.isFinal && event.paragraphBreakAfter) this.segment(event.text.trim(), keys);
      },
      onStatus: (status) => { if (client === this.client) this.handleStatus(status); },
      onError: (message) => { if (client === this.client) this.fail(message); },
    };
    client = new ReconnectingSttClient((config: CloudSttOptions) => new SonioxSttClient(config as SonioxSttOptions), options, () => false);
    this.client = client;
    this.lastSpeechAtMs = Date.now();
    this.setState({ kind: "connecting" });
    client.start();
  }

  /** End the Soniox session; lookups already running still land. */
  pause(): void {
    if (!this.listening) return;
    this.release();
    this.releaseMic();
    this.client?.stop();
    this.client = null;
    this.setState({ kind: "paused" });
  }

  stop(): void {
    this.held = null;
    this.pause();
    this.fact = this.previous = null;
    this.transcript.length = 0;
    this.shownFacts.length = 0;
  }

  tick(nowMs = Date.now()): void {
    if (this.held && nowMs - this.held.sinceMs >= UNFINISHED_HOLD_MS) this.release();
    if (this.state.kind === "listening" && nowMs - this.lastSpeechAtMs >= SILENCE_AUTO_STOP_MS) this.pause();
  }

  /** "Oye, ¿me puedes decir…" is one sentence with a pause inside: keep it until the rest arrives. */
  private segment(text: string, keys: FactKeys): void {
    if (!text) return;
    const joined = this.held ? `${this.held.text} ${text}` : text;
    this.held = null;
    if (isFinished(joined)) this.heard(joined, keys);
    else this.held = { text: joined, sinceMs: Date.now(), keys };
  }

  private release(): void {
    const held = this.held;
    this.held = null;
    if (held) this.heard(held.text, held.keys);
  }

  private heard(sentence: string, keys: FactKeys): void {
    if (!sentence) return;
    const index = ++this.heardCount;
    const context = { earlier: [...this.transcript], shown: [...this.shownFacts], isStale: () => index < this.shownIndex };
    this.transcript.push(sentence);
    if (this.transcript.length > KEPT_SENTENCES) this.transcript.shift();
    void this.lookup(sentence, this.language, keys, context).then((fact) => {
      if (!fact || index < this.shownIndex) return;
      this.shownIndex = index;
      this.previous = this.fact;
      this.fact = fact;
      this.shownFacts.push(fact.text);
      if (this.shownFacts.length > KEPT_FACTS) this.shownFacts.shift();
      this.onChange();
    }, () => {});
  }

  private handleStatus(status: string): void {
    if (status.startsWith("Listening")) this.setState({ kind: "listening" });
    else if (status.startsWith("Connection lost")) this.setState({ kind: "reconnecting" });
  }

  private fail(message: string): void {
    this.releaseMic();
    this.client = null;
    this.setState({ kind: "failed", message: describeFailure(message) });
  }

  private releaseMic(): void {
    if (this.offPcm) {
      this.offPcm();
      voiceControlBridge.stopRawCapture();
    }
    this.offPcm = null;
    this.offVoiceActivity?.();
    this.offVoiceActivity = null;
  }

  private setState(state: ConverseState): void {
    this.state = state;
    this.onChange();
  }
}

/** Soniox closes "…o sea, por." with a period on a pause; a sentence never ends on one of these. */
const DANGLING_WORD = /(?<![A-Za-zÀ-ÿ])(a|al|de|del|el|la|los|las|un|una|y|o|que|en|por|para|con|pero|porque|the|of|to|and|or|but|in|for|with)\.["'»”)]*$/i;

/** Ends in . ? or ! (not "...", not after a preposition or article) and closes every ¿ and ¡ it opens. */
export function isFinished(text: string): boolean {
  const trimmed = text.trim();
  if (!/[.?!]["'»”)]*$/.test(trimmed) || /(\.\.\.|…)["'»”)]*$/.test(trimmed) || DANGLING_WORD.test(trimmed)) return false;
  const count = (pattern: RegExp) => (trimmed.match(pattern) ?? []).length;
  return count(/¿/g) <= count(/\?/g) && count(/¡/g) <= count(/!/g);
}
