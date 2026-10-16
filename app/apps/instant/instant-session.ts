/**
 * Instant on the glasses: the mic opens on a click or "Hey Even", Soniox
 * closes the sentence aggressively (~15 ms after the last word in
 * research/instant-chat/plan.md), and the question goes straight to the turn
 * with no draft to confirm. The mic stays open a few seconds for a follow-up;
 * speech that continues a question still being answered restarts it whole.
 */
import type { InstantChat } from "../../assistant/instant/instant-chat";
import type { TurnHandle, TurnInput, TurnOutcome, TurnPhase } from "../../assistant/instant/instant-turn";
import type { CloudSttClient, CloudSttOptions } from "../../native/cloud-stt";
import { ReconnectingSttClient } from "../../native/reconnecting-stt";
import { SonioxSttClient, type SonioxSttOptions } from "../../native/soniox-stt";
import { voiceControlBridge } from "../../native/voice-control";
import { voiceActivity } from "../../ui/shell/voice-activity";
import { isFinished } from "../converse/converse-session";
import { activeCommunicator } from "../evenhub/mic-router";
import { describeFailure } from "../translate/translate-session";

export type InstantState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "listening" }
  | { kind: "missing-key"; service: string }
  | { kind: "no-glasses" }
  | { kind: "mic-busy" }
  | { kind: "failed"; message: string };

export type InstantCurrent = { question: string; answer: string; phase: TurnPhase | "done"; startedAtMs: number };

export type InstantSessionDeps = {
  chat: InstantChat;
  sonioxKey(): string;
  /** The first service still missing a key, or null. */
  missingKey(): string | null;
  /** Opens connections and gathers the context while the user talks. */
  prepare(): Promise<string>;
  ask(input: TurnInput, onText: (text: string) => void, onPhase: (phase: TurnPhase) => void): TurnHandle;
  finished(question: string, outcome: TurnOutcome, heardMs: number): void;
};

/** After an answer, the mic waits this long for a follow-up before closing. */
export const FOLLOW_UP_MS = 6000;
/** A sentence that ends unfinished ("pon un timer de…") waits this long for the rest. */
export const UNFINISHED_HOLD_MS = 1500;
/** Opened but nothing said: give up. */
const NOTHING_SAID_MS = 8000;

export class InstantSession {
  state: InstantState = { kind: "idle" };
  /** What Soniox is hearing right now, before the sentence closes. */
  live = "";
  current: InstantCurrent | null = null;
  private client: CloudSttClient | null = null;
  private offPcm: (() => void) | null = null;
  private offVoiceActivity: (() => void) | null = null;
  private language = "es";
  private turn: TurnHandle | null = null;
  private context: Promise<string> = Promise.resolve("");
  private held: { text: string; sinceMs: number } | null = null;
  private lastSpeechAtMs = 0;
  private openedAtMs = 0;
  private turnSeq = 0;

  constructor(private readonly deps: InstantSessionDeps, private readonly onChange: () => void) {}

  get listening(): boolean { return this.state.kind === "connecting" || this.state.kind === "listening"; }
  get answering(): boolean { return !!this.current && this.current.phase !== "done"; }

  listen(): void {
    if (this.listening) return;
    const missing = this.deps.missingKey();
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
    this.context = this.deps.prepare().catch(() => "");
    let client: CloudSttClient | null = null;
    const options: SonioxSttOptions = {
      apiKey: this.deps.sonioxKey(),
      languageHints: ["es", "en"],
      diarization: false,
      endpoint: { sensitivity: 0.5, maxDelayMs: 600, latencyLevel: 3 },
      onTokens: (tokens) => {
        if (client !== this.client) return;
        if (tokens.some((token) => token.text.trim() && token.text !== "<end>")) this.lastSpeechAtMs = Date.now();
        const spoken = tokens.find((token) => token.is_final && token.language);
        if (spoken?.language) this.language = spoken.language;
      },
      onTranscript: (event) => {
        if (client !== this.client) return;
        if (event.isFinal && event.paragraphBreakAfter) {
          this.live = "";
          this.segment(event.text.trim());
        } else if (!event.isFinal) {
          this.live = event.text.trim();
          this.onChange();
        }
      },
      onStatus: (status) => {
        if (client === this.client && status.startsWith("Listening")) this.setState({ kind: "listening" });
      },
      onError: (message) => { if (client === this.client) this.fail(message); },
    };
    client = new ReconnectingSttClient((config: CloudSttOptions) => new SonioxSttClient(config as SonioxSttOptions), options, () => false);
    this.client = client;
    this.openedAtMs = this.lastSpeechAtMs = Date.now();
    this.setState({ kind: "connecting" });
    client.start();
  }

  /** Typed on the phone: asked as if spoken. */
  askText(text: string): void {
    const question = text.trim();
    if (!question) return;
    const missing = this.deps.missingKey();
    if (missing) return this.setState({ kind: "missing-key", service: missing });
    if (!this.listening) this.context = this.deps.prepare().catch(() => "");
    this.ask(question);
  }

  /** A click while talking closes the sentence now instead of waiting for Soniox. */
  finishSpeaking(): void {
    this.client?.commitSegment?.();
  }

  stopListening(): void {
    if (!this.listening) return;
    this.held = null;
    this.live = "";
    this.releaseMic();
    this.client?.stop();
    this.client = null;
    this.setState({ kind: "idle" });
  }

  cancel(): void {
    this.turn?.cancel();
    this.turn = null;
    if (this.current && this.current.phase !== "done") this.current = null;
    this.stopListening();
  }

  tick(nowMs = Date.now()): void {
    if (this.held && nowMs - this.held.sinceMs >= UNFINISHED_HOLD_MS) {
      const text = this.held.text;
      this.held = null;
      this.ask(text);
    }
    if (this.state.kind !== "listening" || this.held || this.answering || this.live) return;
    const quietFor = nowMs - this.lastSpeechAtMs;
    if (this.current ? quietFor >= FOLLOW_UP_MS : nowMs - this.openedAtMs >= NOTHING_SAID_MS) this.stopListening();
  }

  private segment(text: string): void {
    if (!text) return;
    // Speech that continues a question still being answered: ask the whole thing again.
    if (this.answering && this.current && Date.now() - this.current.startedAtMs < 3000) {
      this.turn?.cancel();
      text = `${this.current.question} ${text}`;
    }
    const joined = this.held ? `${this.held.text} ${text}` : text;
    this.held = null;
    if (isFinished(joined)) this.ask(joined);
    else {
      this.held = { text: joined, sinceMs: Date.now() };
      this.onChange();
    }
  }

  private ask(question: string): void {
    const heardAt = Date.now();
    const seq = ++this.turnSeq;
    this.current = { question, answer: "", phase: "thinking", startedAtMs: heardAt };
    this.onChange();
    const turn = this.deps.ask({ question, language: this.language, context: this.context },
      (text) => { if (seq === this.turnSeq && this.current) { this.current.answer = text; this.onChange(); } },
      (phase) => { if (seq === this.turnSeq && this.current) { this.current.phase = phase; this.onChange(); } });
    this.turn = turn;
    void turn.result.then((outcome) => {
      if (seq !== this.turnSeq) return;
      this.turn = null;
      this.current = { question, answer: outcome.answer, phase: "done", startedAtMs: heardAt };
      this.lastSpeechAtMs = Date.now();
      this.deps.finished(question, outcome, heardAt);
      // A fresh context for a follow-up: the answer may have changed timers or music.
      this.context = this.deps.prepare().catch(() => "");
      this.onChange();
    }, () => {});
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

  private setState(state: InstantState): void {
    this.state = state;
    this.onChange();
  }
}
