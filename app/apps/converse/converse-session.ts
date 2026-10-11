import type { CloudSttClient, CloudSttOptions } from "../../native/cloud-stt";
import { ReconnectingSttClient } from "../../native/reconnecting-stt";
import { SonioxSttClient, type SonioxSttOptions } from "../../native/soniox-stt";
import { voiceControlBridge } from "../../native/voice-control";
import { braveApiKeySetting, openRouterApiKeySetting, perplexityApiKeySetting, sonioxApiKeySetting } from "../../ui/dashboard-settings";
import { voiceActivity } from "../../ui/shell/voice-activity";
import { activeCommunicator } from "../evenhub/mic-router";
import { describeFailure } from "../translate/translate-session";
import type { Fact, FactKeys } from "./converse-facts";

export type ConverseState =
  | { kind: "connecting" }
  | { kind: "listening" }
  | { kind: "reconnecting" }
  | { kind: "paused" }
  | { kind: "missing-key"; service: string }
  | { kind: "no-glasses" }
  | { kind: "mic-busy" }
  | { kind: "failed"; message: string };

export type FactLookup = (sentence: string, language: string, keys: FactKeys) => Promise<Fact | null>;

export const SILENCE_AUTO_STOP_MS = 3 * 60_000;

/**
 * Live facts: the glasses mic into a Soniox ES/EN session through the shared
 * raw-PCM tap (as Translate does), and every finished sentence into a fact
 * lookup. A slower lookup never replaces the fact of a later sentence.
 */
export class ConverseSession {
  state: ConverseState = { kind: "paused" };
  fact: Fact | null = null;
  private client: CloudSttClient | null = null;
  private offPcm: (() => void) | null = null;
  private offVoiceActivity: (() => void) | null = null;
  private language = "es";
  private heardCount = 0;
  private shownIndex = 0;
  private lastSpeechAtMs = 0;

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
    const keys = { openRouter: openRouterApiKeySetting.get().trim(), perplexity: perplexityApiKeySetting.get().trim(), brave: braveApiKeySetting.get().trim() };
    if (!apiKey) return this.setState({ kind: "missing-key", service: "Soniox" });
    if (!keys.openRouter) return this.setState({ kind: "missing-key", service: "OpenRouter" });
    if (!keys.perplexity && !keys.brave) return this.setState({ kind: "missing-key", service: "Perplexity" });
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
      onTokens: (tokens) => {
        if (client !== this.client) return;
        this.lastSpeechAtMs = Date.now();
        const spoken = tokens.find((token) => token.is_final && token.language);
        if (spoken?.language) this.language = spoken.language;
      },
      onTranscript: (event) => {
        if (client === this.client && event.isFinal && event.paragraphBreakAfter) this.heard(event.text.trim(), keys);
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
    this.releaseMic();
    this.client?.stop();
    this.client = null;
    this.setState({ kind: "paused" });
  }

  stop(): void {
    this.pause();
    this.fact = null;
  }

  tick(nowMs = Date.now()): void {
    if (this.state.kind === "listening" && nowMs - this.lastSpeechAtMs >= SILENCE_AUTO_STOP_MS) this.pause();
  }

  private heard(sentence: string, keys: FactKeys): void {
    if (!sentence) return;
    const index = ++this.heardCount;
    void this.lookup(sentence, this.language, keys).then((fact) => {
      if (!fact || index < this.shownIndex) return;
      this.shownIndex = index;
      this.fact = fact;
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
