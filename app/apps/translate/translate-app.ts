import { GrayImage } from "../../graphics/image";
import { makeInputEvent, type InputEvent } from "../../ui/gestures";
import { type Layer, type LayerContext } from "../../ui/layers";
import {
  createInProcessWindow,
  YieldAtRootLayer,
  type InProcessAppOptions,
  type InProcessWindow,
} from "../../ui/shell/in-process-window";
import type { Face } from "../paseo/paseo-painter";
import { terminalFace } from "../terminal-face";
import { formatElapsed } from "./translate-model";
import { LEAVE_OPTIONS, paintTranslate, translateMaxScrollBack, type TranslateView } from "./translate-painter";
import { TranslateSession, type TranslateState } from "./translate-session";

export const TRANSLATE_WINDOW_ID = "translate";
export const TRANSLATE_SURFACE_ID = "window:translate";

const MESSAGES: Partial<Record<TranslateState["kind"], { title: string; detail: string }>> = {
  "missing-key": { title: "Soniox key missing", detail: "Add the Soniox key in the phone app, under API keys." },
  "no-glasses": { title: "Glasses not connected", detail: "Translate listens through the glasses mic." },
  "mic-busy": { title: "Microphone in use", detail: "Another voice capture has the glasses mic." },
};

const LABELS: Partial<Record<TranslateState["kind"], string>> = {
  connecting: "· Connecting",
  translating: "· Translating",
  reconnecting: "· Reconnecting",
  paused: "· Paused",
};

export function translateView(session: TranslateSession, scrollBack: number, leaving: TranslateView["leaving"], nowMs = Date.now()): TranslateView {
  const state = session.state;
  const message = state.kind === "failed" ? { title: "Translation stopped", detail: state.message } : MESSAGES[state.kind] ?? null;
  const elapsed = session.elapsedMs(nowMs);
  return {
    segments: session.transcript.segments(),
    scrollBack,
    footer: {
      label: LABELS[state.kind] ?? "· Translate",
      bright: state.kind === "paused",
      elapsed: session.recording || elapsed > 0 ? formatElapsed(elapsed) : "",
    },
    message,
    leaving,
  };
}

/**
 * The conversation: tap pauses or resumes, scroll goes back through earlier
 * exchanges, and leaving while listening asks first (TranslateRootLayer).
 */
class TranslateLayer implements Layer {
  leaving: { selected: number } | null = null;
  /** "Stop and leave" was chosen; the root layer leaves the app. */
  leaveRequested = false;
  private scrollBack = 0;

  constructor(
    readonly session: TranslateSession,
    private readonly face: () => Face,
  ) {}

  paint(ctx: LayerContext): GrayImage {
    const { width, height } = ctx.stack.getBaseSize();
    const image = new GrayImage(width, height, 0);
    const view = translateView(this.session, this.scrollBack, this.leaving);
    this.scrollBack = Math.min(this.scrollBack, translateMaxScrollBack(view));
    paintTranslate(image, this.face(), { ...view, scrollBack: this.scrollBack });
    return image;
  }

  handleInput(event: InputEvent): void {
    if (this.leaving) {
      if (event.type === "scroll-up") this.leaving.selected = 0;
      else if (event.type === "scroll-down") this.leaving.selected = LEAVE_OPTIONS.length - 1;
      else if (event.type === "click") {
        const stop = this.leaving.selected === 1;
        this.leaving = null;
        if (stop) {
          this.session.stop();
          this.leaveRequested = true;
        }
      }
      return;
    }
    if (event.type === "click") {
      if (this.session.recording) this.session.pause();
      else {
        this.scrollBack = 0;
        this.session.start();
      }
    } else if (event.type === "scroll-up") {
      this.scrollBack++;
    } else if (event.type === "scroll-down") {
      this.scrollBack = Math.max(0, this.scrollBack - 1);
    }
  }

  /** Double tap: answer the open dialog with "Keep listening", or open it while listening. */
  interceptBack(): boolean {
    if (this.leaving) {
      this.leaving = null;
      return true;
    }
    if (this.session.recording) {
      this.leaving = { selected: 0 };
      return true;
    }
    return false;
  }
}

class TranslateRootLayer extends YieldAtRootLayer {
  constructor(private readonly translate: TranslateLayer) {
    super(translate);
  }

  override async handleInput(event: InputEvent, ctx: LayerContext): Promise<void> {
    if (event.type === "double-click") {
      if (this.translate.interceptBack()) return;
      this.translate.session.stop();
    }
    await super.handleInput(event, ctx);
    if (this.translate.leaveRequested) {
      this.translate.leaveRequested = false;
      await super.handleInput(makeInputEvent({ type: "double-click", source: "ring" }), ctx);
    }
  }
}

/**
 * Translate: opens straight into a two-way ES⇄EN live translation through
 * Soniox (translate-session.ts). Leaving the foreground or turning the
 * screen off pauses it; coming back resumes.
 */
export function createTranslateAppWindow(options: InProcessAppOptions): InProcessWindow {
  let tick: ReturnType<typeof setInterval> | null = null;
  const session = new TranslateSession(() => app.requestRender());
  const layer = new TranslateLayer(session, terminalFace);

  const app = createInProcessWindow({
    appId: "translate",
    windowId: TRANSLATE_WINDOW_ID,
    title: "Translate",
    iconLetter: "Tr",
    icon: "mic",
    closeable: true,
    actions: options.actions,
    baseLayer: new TranslateRootLayer(layer),
    isVoiceCapturing: () => session.recording,
    onForegroundChanged: (foreground) => {
      if (foreground) session.start();
      else {
        layer.leaving = null;
        session.pause();
      }
    },
    setScreenOn: (on) => {
      if (!on) session.pause();
    },
    submitFrame: options.submitFrame,
    setSurfaceVisible: options.setSurfaceVisible,
    removeSurface: options.removeSurface,
    onClosed: () => {
      session.stop();
      if (tick !== null) clearInterval(tick);
      options.onClosed();
    },
  });

  tick = setInterval(() => {
    session.tick();
    if (session.recording) app.requestRender();
  }, 1000);
  session.start();
  return app;
}
