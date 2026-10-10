import type { CloudSttClient, CloudSttOptions } from "../../native/cloud-stt";
import { ReconnectingSttClient } from "../../native/reconnecting-stt";
import { SonioxSttClient, type SonioxSttOptions } from "../../native/soniox-stt";
import { voiceControlBridge } from "../../native/voice-control";
import { sonioxApiKeySetting } from "../../ui/dashboard-settings";
import { voiceActivity } from "../../ui/shell/voice-activity";
import { activeCommunicator } from "../evenhub/mic-router";
import { TranslationTranscript } from "./translate-model";

export type TranslateState =
  | { kind: "connecting" }
  | { kind: "translating" }
  | { kind: "reconnecting" }
  | { kind: "paused" }
  | { kind: "missing-key" }
  | { kind: "no-glasses" }
  | { kind: "mic-busy" }
  | { kind: "failed"; message: string };

export const SILENCE_AUTO_STOP_MS = 3 * 60_000;
const TRANSLATION = { type: "two_way", language_a: "es", language_b: "en" } as const;

/**
 * One two-way ES⇄EN translation: the glasses mic through the shared raw-PCM
 * tap (the same tap Paseo dictation and EvenHub apps use, so an STT capture
 * such as the assistant preempts it and it is re-requested afterwards) into
 * a Soniox real-time translation session. Pausing ends the Soniox session,
 * so nothing is billed or captured while paused.
 */
export class TranslateSession {
  readonly transcript = new TranslationTranscript();
  state: TranslateState = { kind: "paused" };
  private client: CloudSttClient | null = null;
  private draining: CloudSttClient | null = null;
  private offPcm: (() => void) | null = null;
  private offVoiceActivity: (() => void) | null = null;
  private elapsedBeforeMs = 0;
  private recordingSinceMs = 0;

  constructor(private readonly onChange: () => void) {}

  get recording(): boolean {
    return this.state.kind === "connecting" || this.state.kind === "translating" || this.state.kind === "reconnecting";
  }

  elapsedMs(nowMs = Date.now()): number {
    return this.elapsedBeforeMs + (this.recording ? nowMs - this.recordingSinceMs : 0);
  }

  start(): void {
    if (this.recording) return;
    const apiKey = sonioxApiKeySetting.get().trim();
    if (!apiKey) return this.setState({ kind: "missing-key" });
    const communicator = activeCommunicator();
    if (!communicator) return this.setState({ kind: "no-glasses" });
    this.draining?.stop();
    this.draining = null;
    this.transcript.dropLive();
    this.transcript.close();
    this.offPcm = voiceControlBridge.onRawPcm((pcm) => this.client?.acceptPcm(pcm));
    if (!voiceControlBridge.startRawCapture({ communicator })) {
      this.releaseMic();
      return this.setState({ kind: "mic-busy" });
    }
    this.offVoiceActivity = voiceActivity.subscribe((active) => {
      if (!active && this.recording) voiceControlBridge.startRawCapture({ communicator: activeCommunicator() });
    });
    let client: CloudSttClient | null = null;
    const options: SonioxSttOptions = {
      apiKey,
      translation: TRANSLATION,
      onTokens: (tokens) => {
        // A paused session still delivers the finals of what was already said.
        if (client !== this.client && client !== this.draining) return;
        if (this.transcript.accept(tokens, Date.now())) this.onChange();
      },
      onTranscript: () => {},
      onStatus: (status) => { if (client === this.client) this.handleStatus(status); },
      onError: (message) => { if (client === this.client) this.fail(message); },
    };
    client = new ReconnectingSttClient((config: CloudSttOptions) => new SonioxSttClient(config as SonioxSttOptions), options, () => false);
    this.client = client;
    this.recordingSinceMs = Date.now();
    this.transcript.lastSpeechAtMs = this.recordingSinceMs;
    this.setState({ kind: "connecting" });
    client.start();
  }

  /** End the Soniox session, letting it finalize what was already said. */
  pause(): void {
    if (!this.recording) return;
    this.elapsedBeforeMs += Date.now() - this.recordingSinceMs;
    this.releaseMic();
    this.draining = this.client;
    this.client = null;
    this.draining?.finish();
    this.setState({ kind: "paused" });
  }

  stop(): void {
    if (this.recording) this.elapsedBeforeMs += Date.now() - this.recordingSinceMs;
    this.releaseMic();
    this.client?.stop();
    this.draining?.stop();
    this.client = this.draining = null;
    this.transcript.dropLive();
    this.transcript.close();
    if (this.recording) this.setState({ kind: "paused" });
  }

  /** Clock tick: pause after SILENCE_AUTO_STOP_MS without speech. */
  tick(nowMs = Date.now()): void {
    if (this.state.kind === "translating" && nowMs - this.transcript.lastSpeechAtMs >= SILENCE_AUTO_STOP_MS) this.pause();
  }

  private handleStatus(status: string): void {
    if (status.startsWith("Listening")) this.setState({ kind: "translating" });
    else if (status.startsWith("Connection lost")) {
      // The reconnect is a new Soniox session: its tokens start a new segment.
      this.transcript.dropLive();
      this.transcript.close();
      this.setState({ kind: "reconnecting" });
    }
  }

  private fail(message: string): void {
    if (this.recording) this.elapsedBeforeMs += Date.now() - this.recordingSinceMs;
    this.releaseMic();
    this.client = null;
    this.transcript.dropLive();
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

  private setState(state: TranslateState): void {
    this.state = state;
    this.onChange();
  }
}

export function describeFailure(message: string): string {
  if (/\b401\b|unauthori[sz]ed|invalid api key/i.test(message)) return "The Soniox key was rejected.";
  if (/\b402\b|credit|balance|payment/i.test(message)) return "The Soniox account is out of credit.";
  return message.replace(/^Soniox:\s*/, "");
}
