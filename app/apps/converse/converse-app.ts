import { Device, Http } from "@nativescript/core";
import { GrayImage } from "../../graphics/image";
import type { InputEvent } from "../../ui/gestures";
import type { Layer, LayerContext } from "../../ui/layers";
import {
  createInProcessWindow,
  YieldAtRootLayer,
  type InProcessAppOptions,
  type InProcessWindow,
} from "../../ui/shell/in-process-window";
import { terminalFace } from "../../ui/terminal-face";
import type { Face } from "../paseo/paseo-painter";
import { lookupFact, type Post } from "./converse-facts";
import { ConverseLog } from "./converse-log";
import { paintConverse, type ConverseView } from "./converse-painter";
import { ConverseSession, type ConverseState } from "./converse-session";

export const CONVERSE_WINDOW_ID = "converse";
export const CONVERSE_SURFACE_ID = "window:converse";

const LABELS: Partial<Record<ConverseState["kind"], string>> = {
  connecting: "· Connecting",
  reconnecting: "· Reconnecting",
  paused: "· Paused",
};

export function converseView(session: Pick<ConverseSession, "state" | "fact" | "previous">): ConverseView {
  const state = session.state;
  const message = state.kind === "missing-key" ? { title: `${state.service} key missing`, detail: "Add it in the phone app, under API keys." }
    : state.kind === "no-glasses" ? { title: "Glasses not connected", detail: "Live facts listens through the glasses mic." }
    : state.kind === "mic-busy" ? { title: "Microphone in use", detail: "Another voice capture has the glasses mic." }
    : state.kind === "failed" ? { title: "Live facts stopped", detail: state.message }
    : null;
  const label = LABELS[state.kind] ?? (state.kind === "listening" && !session.fact ? "· Live facts" : "");
  return { fact: session.fact, previous: session.previous, status: { label, bright: state.kind === "paused" }, message };
}

const post: Post = async (url, headers, body, timeoutMs) => {
  const response = await Http.request({ url, method: body === null ? "GET" : "POST", headers, ...(body === null ? {} : { content: body }), timeout: timeoutMs });
  let json: unknown = null;
  try {
    json = response.content?.toJSON();
  } catch { /* non-JSON error body */ }
  return { status: response.statusCode, json };
};

/** Tap pauses or resumes listening. */
class ConverseLayer implements Layer {
  constructor(
    readonly session: ConverseSession,
    private readonly face: () => Face,
  ) {}

  paint(ctx: LayerContext): GrayImage {
    const { width, height } = ctx.stack.getBaseSize();
    const image = new GrayImage(width, height, 0);
    paintConverse(image, this.face(), converseView(this.session));
    return image;
  }

  handleInput(event: InputEvent): void {
    if (event.type !== "click") return;
    if (this.session.listening) this.session.pause();
    else this.session.start();
  }
}

class ConverseRootLayer extends YieldAtRootLayer {
  constructor(private readonly converse: ConverseLayer) {
    super(converse);
  }

  override async handleInput(event: InputEvent, ctx: LayerContext): Promise<void> {
    if (event.type === "double-click") this.converse.session.stop();
    await super.handleInput(event, ctx);
  }
}

/**
 * Converse: opens straight into live facts (converse-session.ts). Leaving
 * the foreground or turning the screen off pauses it; coming back resumes.
 */
export function createConverseWindow(options: InProcessAppOptions): InProcessWindow {
  const log = new ConverseLog();
  const session = new ConverseSession(() => app.requestRender(), async (sentence, language, keys, context) => {
    const done = log.sentence(sentence, language);
    const fact = await lookupFact(sentence, language, keys, post, { ...context, region: Device.region }).catch(() => null);
    done(fact);
    return fact;
  });
  const layer = new ConverseLayer(session, terminalFace);
  const app = createInProcessWindow({
    appId: "converse",
    windowId: CONVERSE_WINDOW_ID,
    title: "Converse",
    iconLetter: "Cv",
    icon: "message-circle",
    closeable: true,
    actions: options.actions,
    baseLayer: new ConverseRootLayer(layer),
    isVoiceCapturing: () => session.listening,
    onForegroundChanged: (foreground) => {
      if (foreground) session.start();
      else session.pause();
    },
    setScreenOn: (on) => {
      if (!on) session.pause();
    },
    submitFrame: options.submitFrame,
    setSurfaceVisible: options.setSurfaceVisible,
    removeSurface: options.removeSurface,
    onClosed: () => {
      session.stop();
      clearInterval(tick);
      options.onClosed();
    },
  });
  const tick = setInterval(() => session.tick(), 1000);
  session.start();
  return app;
}
