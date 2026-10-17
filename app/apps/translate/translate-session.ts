import type { CloudSttClient, CloudSttOptions } from "../../native/cloud-stt";
import { ReconnectingSttClient } from "../../native/reconnecting-stt";
import { SonioxSttClient, type SonioxSttOptions } from "../../native/soniox-stt";
import { voiceControlBridge } from "../../native/voice-control";
import { sonioxApiKeySetting } from "../../ui/dashboard-settings";
import { voiceActivity } from "../../ui/shell/voice-activity";
import { activeCommunicator } from "../evenhub/mic-router";
import { TranslationTranscript } from "./translate-model";
import { WearerVoice } from "./wearer-voice";

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
/** Shared so a reopened Translate already knows how loud the wearer is. */
const wearerVoice = new WearerVoice();

/**
 * One two-way ES⇄EN translation: the glasses mic through the shared raw-PCM
 * tap (the same tap Paseo dictation and EvenHub apps use, so an STT capture
 * such as the assistant preempts it and it is re-requested afterwards) into
 * a Soniox real-time translation session. Pausing ends the Soniox session,
 * so nothing is billed or captured while paused.
 */
export class TranslateSession {
  private readonly micOwner = Symbol("translate");
  readonly transcript = new TranslationTranscript(wearerVoice);
  state: TranslateState = { kind: "paused" };
  private client: CloudSttClient | null = null;
  private draining: CloudSttClient | null = null;
  private offPcm: (() => void) | null = null;
  private offVoiceActivity: (() => void) | null = null;

  constructor(private readonly onChange: () => void) {}

  get recording(): boolean {
    return this.state.kind === "connecting" || this.state.kind === "translating" || this.state.kind === "reconnecting";
  }

  start(): void {
    if (this.recording) return;
    const apiKey = sonioxApiKeySetting.get().trim();
    if (!apiKey) return this.setState({ kind: "missing-key" });
    const communicator = activeCommunicator();
    if (!communicator) return this.setState({ kind: "no-glasses" });
    this.draining?.stop();
    this.draining = null;
    this.transcript.newSession();
    this.offPcm = voiceControlBridge.onRawPcm((pcm) => this.client?.acceptPcm(pcm));
    if (!voiceControlBridge.startRawCapture({ communicator, owner: this.micOwner })) {
      this.releaseMic();
      return this.setState({ kind: "mic-busy" });
    }
    this.offVoiceActivity = voiceActivity.subscribe((active) => {
      if (!active && this.recording) voiceControlBridge.startRawCapture({ communicator: activeCommunicator(), owner: this.micOwner });
    });
    let client: CloudSttClient | null = null;
    const options: SonioxSttOptions = {
      apiKey,
      translation: TRANSLATION,
      measureLoudness: true,
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
    this.transcript.lastSpeechAtMs = Date.now();
    this.setState({ kind: "connecting" });
    client.start();
  }

  /** End the Soniox session, letting it finalize what was already said. */
  pause(): void {
    if (!this.recording) return;
    this.releaseMic();
    this.draining = this.client;
    this.client = null;
    this.draining?.finish();
    this.setState({ kind: "paused" });
  }

  stop(): void {
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
      this.transcript.newSession();
      this.setState({ kind: "reconnecting" });
    }
  }

  private fail(message: string): void {
    this.releaseMic();
    this.client = null;
    this.transcript.dropLive();
    this.setState({ kind: "failed", message: describeFailure(message) });
  }

  private releaseMic(): void {
    if (this.offPcm) {
      this.offPcm();
      voiceControlBridge.stopRawCapture(this.micOwner);
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
