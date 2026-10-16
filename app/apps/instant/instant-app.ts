import { Device, Http } from "@nativescript/core";
import { InstantChat } from "../../assistant/instant/instant-chat";
import { chatTargets, prewarm } from "../../assistant/instant/instant-llm";
import { instantTools } from "../../assistant/instant/instant-tools";
import { promptMessages, runTurn, summarizer, type TurnPhase } from "../../assistant/instant/instant-turn";
import { grokBotHub } from "../../assistant/grokbot/grokbot";
import { toolRegistry } from "../../assistant/tool-registry";
import type { Post } from "../../assistant/web-search";
import { GrayImage } from "../../graphics/image";
import { getStringSetting, setStringSetting } from "../../native/settings-store";
import { openSseRequest } from "../../native/sse";
import { timeFormatSetting } from "../../ui/dashboard-settings";
import type { InputEvent } from "../../ui/gestures";
import type { Layer, LayerContext } from "../../ui/layers";
import type { MenuItem } from "../../ui/menu";
import { createInProcessWindow, type InProcessAppOptions, type InProcessWindow } from "../../ui/shell/in-process-window";
import { shell } from "../../ui/shell/shell";
import { terminalFace } from "../../ui/terminal-face";
import type { AppContext } from "../app-definition";
import { gatherContext } from "./instant-context";
import { instantKeys, missingInstantKey } from "./instant-keys";
import { InstantLog } from "./instant-log";
import { instantMaxScrollBack, paintInstant, type InstantView } from "./instant-painter";
import { InstantSession } from "./instant-session";

export const INSTANT_WINDOW_ID = "instant";
const INSTANT_SURFACE_ID = "window:instant";
export const INSTANT_TITLE = "Instant";
const CHAT_KEY = "instant.chat";
const SCROLL_ROWS = 3;
const SHOWN_TURNS = 4;
/** "Searching" only appears when the answer is slow enough to notice. */
const SHOW_PHASE_AFTER_MS = 800;

export const instantChat = new InstantChat({ read: () => getStringSetting(CHAT_KEY, ""), write: (value) => setStringSetting(CHAT_KEY, value) });

let activeLayer: InstantLayer | null = null;

const post: Post = async (url, headers, body, timeoutMs) => {
  const response = await Http.request({ url, method: body === null ? "GET" : "POST", headers, ...(body === null ? {} : { content: body }), timeout: timeoutMs });
  let json: unknown = null;
  try {
    json = response.content?.toJSON();
  } catch { /* non-JSON error body */ }
  return { status: response.statusCode, json };
};

function clock(): string {
  const now = new Date();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  if (timeFormatSetting.get() === "24h") return `${now.getHours()}:${minutes}`;
  return `${now.getHours() % 12 || 12}:${minutes} ${now.getHours() < 12 ? "a. m." : "p. m."}`;
}

export function instantReady(): boolean {
  return missingInstantKey(instantKeys()) === null;
}

/** Instant in front, with the conversation scrolled to its newest turn. */
export async function launchInstant(ctx: AppContext): Promise<void> {
  await ctx.launchInProcessApp(INSTANT_WINDOW_ID, INSTANT_SURFACE_ID, (options) => createInstantWindow(options));
  activeLayer?.land();
}

/** The wakeword's mic, once Instant is in front. */
export function startInstantListening(): boolean {
  if (!activeLayer) return false;
  activeLayer.session.listen();
  return true;
}

/** Text from the voice or keyboard dialog. */
export function sendToInstant(text: string): void {
  activeLayer?.session.askText(text);
}

function createSession(onChange: () => void): InstantSession {
  const log = new InstantLog();
  const tools = () => instantTools(toolRegistry.listTools());
  const targets = () => chatTargets(instantKeys());
  return new InstantSession({
    chat: instantChat,
    sonioxKey: () => instantKeys().soniox,
    missingKey: () => missingInstantKey(instantKeys()),
    prepare: () => {
      const keys = instantKeys();
      // The fixed prefix of the next request, so the providers cache it while the user talks.
      prewarm(openSseRequest, targets(), { messages: promptMessages(instantChat, Date.now(), "", "."), tools: tools() });
      if (keys.perplexity) void post("https://api.perplexity.ai/", {}, null, 3000).catch(() => null);
      return gatherContext(Device.region);
    },
    ask: (input, onText, onPhase) => {
      const keys = instantKeys();
      return runTurn(input, {
        open: openSseRequest,
        post,
        targets: targets(),
        searchKeys: { perplexity: keys.perplexity, brave: keys.brave },
        region: Device.region,
        tools: tools(),
        chat: instantChat,
        callTool: (name, args) => toolRegistry.callTool(name, args),
        askGrokBot: async (task) => (await grokBotHub.send(grokBotHub.defaultBot, task)) || null,
        clock,
        now: Date.now,
      }, onText, onPhase);
    },
    finished: (question, outcome, heardAtMs) => {
      log.add(question, outcome, heardAtMs);
      if (outcome.route === "error") return;
      instantChat.add({ question, answer: outcome.answer, atMs: heardAtMs });
      if (instantChat.needsCompaction()) void instantChat.compact(summarizer(openSseRequest, targets()));
    },
  }, onChange);
}

class InstantLayer implements Layer {
  readonly acceptsDirectional = true;
  readonly session: InstantSession;
  private scrollBack = 0;
  private maxScrollBack = 0;
  private requestRender = () => {};

  constructor() {
    this.session = createSession(() => { this.scrollBack = 0; this.requestRender(); });
  }

  start(render: () => void): () => void {
    this.requestRender = render;
    const timer = setInterval(() => {
      this.session.tick();
      if (this.session.answering) render();
    }, 250);
    return () => clearInterval(timer);
  }

  land(): void {
    this.scrollBack = 0;
    this.requestRender();
  }

  view(): InstantView {
    const session = this.session;
    const state = session.state;
    const message = state.kind === "missing-key" ? { title: `${state.service} key missing`, detail: "Add it in the phone app, under API keys." }
      : state.kind === "no-glasses" ? { title: "Glasses not connected", detail: "Instant listens through the glasses mic." }
      : state.kind === "mic-busy" ? { title: "Microphone in use", detail: "Another voice capture has the glasses mic." }
      : state.kind === "failed" ? { title: "Instant stopped listening", detail: state.message }
      : null;
    const turns = instantChat.turns.slice(-SHOWN_TURNS).map((turn) => ({ question: turn.question, answer: turn.answer }));
    const current = session.current;
    if (current && current.phase !== "done") turns.push({ question: current.question, answer: current.answer });
    return { turns, live: session.live, status: this.status(), message, scrollBack: this.scrollBack };
  }

  private status(): string {
    const session = this.session;
    const current = session.current;
    if (current && current.phase !== "done" && Date.now() - current.startedAtMs >= SHOW_PHASE_AFTER_MS) {
      return PHASE_LABELS[current.phase as TurnPhase];
    }
    if (session.state.kind === "connecting") return "· Connecting";
    if (session.listening) return "· Listening";
    return instantChat.turns.length ? "" : `· ${INSTANT_TITLE} · click to ask`;
  }

  paint(ctx: LayerContext): GrayImage {
    const size = ctx.stack.getBaseSize();
    const image = new GrayImage(size.width, size.height);
    const face = terminalFace();
    const view = this.view();
    this.maxScrollBack = instantMaxScrollBack(face, view);
    view.scrollBack = Math.min(this.scrollBack, this.maxScrollBack);
    paintInstant(image, face, view);
    return image;
  }

  handleInput(event: InputEvent): void {
    switch (event.type) {
      case "scroll-up": case "swipe-up": case "scroll-down": case "swipe-down": {
        const down = event.type === "scroll-down" || event.type === "swipe-down";
        this.scrollBack = Math.max(0, Math.min(this.maxScrollBack, this.scrollBack + (down ? -SCROLL_ROWS : SCROLL_ROWS)));
        return;
      }
      case "click":
        if (this.session.listening && this.session.live) this.session.finishSpeaking();
        else if (!this.session.listening) this.session.listen();
        return;
      case "double-click":
        if (this.session.listening || this.session.answering) { this.session.cancel(); return; }
        shell.yieldFocusToSidebar();
        return;
      default: return;
    }
  }

  menuItems(): MenuItem[] {
    return [{ label: "New chat", onSelect: (ctx: LayerContext) => { ctx.stack.clearToBase(); this.session.cancel(); instantChat.clear(); this.requestRender(); } }];
  }

  close(): void {
    this.session.cancel();
  }
}

const PHASE_LABELS: Record<TurnPhase, string> = { thinking: "· Thinking", searching: "· Searching the web", acting: "· On it" };

function createInstantWindow(options: InProcessAppOptions): InProcessWindow {
  const layer = new InstantLayer();
  activeLayer = layer;
  let unsubscribe = () => {};
  const app = createInProcessWindow({
    ...options,
    appId: "instant", windowId: INSTANT_WINDOW_ID, title: INSTANT_TITLE, iconLetter: "I", icon: "zap", closeable: true,
    baseLayer: layer,
    isVoiceCapturing: () => layer.session.listening,
    keepsScreenOn: () => true,
    onSystemMenuOpened: () => layer.session.stopListening(),
    onAppMenuOpened: () => layer.session.stopListening(),
    setScreenOn: (on) => { if (!on) layer.session.stopListening(); },
    onForegroundChanged: (foreground) => { if (!foreground) layer.session.stopListening(); },
    menuItems: () => layer.menuItems(),
    receiveTextInput: (text) => layer.session.askText(text),
    onClosed: () => { unsubscribe(); layer.close(); if (activeLayer === layer) activeLayer = null; options.onClosed(); },
  });
  unsubscribe = layer.start(app.requestRender);
  return app;
}
