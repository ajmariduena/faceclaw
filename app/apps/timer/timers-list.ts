import { GrayImage } from "../../graphics/image";
import type { InputEvent } from "../../ui/gestures";
import type { Layer, LayerContext } from "../../ui/layers";
import { shell } from "../../ui/shell/shell";
import {
  CONTENT_TOP,
  DIM,
  FOOTER_TOP,
  fitLine,
  listScrollTop,
  paintFooter,
  paintTerminalList,
  PITCH,
  type Face,
  type TerminalRow,
} from "../../ui/terminal";
import { terminalFace } from "../../ui/terminal-face";
import { timerEngine } from "./timer-engine";
import { sortTimers, timerPhase, timerRemainingMs, type CountdownTimer } from "./timer-model";

/** "12:34" / "1:02:03" / "0:05". */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mmss = `${hours ? String(minutes).padStart(2, "0") : minutes}:${String(seconds).padStart(2, "0")}`;
  return hours ? `${hours}:${mmss}` : mmss;
}

/** "10 min" / "1 h 30 min" / "45 s", for unlabelled timers. */
export function formatDurationLabel(ms: number): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total} s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  return hours ? (minutes ? `${hours} h ${minutes} min` : `${hours} h`) : `${minutes} min`;
}

export function timerRow(timer: CountdownTimer, nowMs: number): TerminalRow {
  const phase = timerPhase(timer);
  const remaining = formatRemaining(timerRemainingMs(timer, nowMs));
  return {
    label: timer.label || formatDurationLabel(timer.durationMs),
    value: phase === "rung" ? "ringing" : phase === "paused" ? `paused ${remaining}` : remaining,
  };
}

export type TimersListView = {
  timers: readonly CountdownTimer[];
  nowMs: number;
  selected: number;
  /** The cancel prompt for the selected timer is open, with its row (0 = cancel, 1 = keep). */
  confirm: 0 | 1 | null;
};

const BOX_LEFT = 14;
const BOX_WIDTH = 548;
const BOX_TEXT_LEFT = 28;
const BOX_ROW_LEFT = 48;

export function paintTimersList(image: GrayImage, face: Face, view: TimersListView, scrollTop = 0): void {
  const rows = view.timers.map((timer) => timerRow(timer, view.nowMs));
  const running = view.timers.filter((timer) => timerPhase(timer) === "running").length;
  const footer = { left: "· Timers", right: running ? `${running} active` : "" };
  if (view.confirm === null) {
    paintTerminalList(image, face, { rows, selected: view.selected, footer, message: rows.length ? undefined : "No active timers" }, scrollTop);
    return;
  }
  const timer = view.timers[view.selected];
  paintTerminalList(image, face, { rows: timer ? [timerRow(timer, view.nowMs)] : [], selected: -1, footer }, 0);
  const height = PITCH * 3 + 18;
  const top = Math.min(CONTENT_TOP + PITCH + 10, FOOTER_TOP - 8 - height);
  image.drawRoundedRect(BOX_LEFT, top, BOX_WIDTH, height, 255, 6);
  const question = timer && timerPhase(timer) === "rung" ? "Dismiss" : "Cancel";
  face.drawText(image, BOX_TEXT_LEFT, top + 8, fitLine(face, `${question} ${timer ? timerRow(timer, view.nowMs).label : "timer"}?`, BOX_WIDTH - 32), 255);
  [question === "Dismiss" ? "Dismiss" : "Cancel timer", "Keep"].forEach((label, index) => {
    const y = top + 8 + PITCH * (index + 1);
    const active = index === view.confirm;
    if (active) face.drawText(image, BOX_TEXT_LEFT, y, ">", 255);
    face.drawText(image, BOX_ROW_LEFT, y, label, active ? 255 : DIM);
  });
  paintFooter(image, face, footer.left, footer.right);
}

/** The lean Timers app: the active countdowns, view and cancel. Creation stays with the AI Chat tools. */
export class TimersListLayer implements Layer {
  readonly acceptsDirectional = true;
  private selected = 0;
  private scrollTop = 0;
  private confirm: 0 | 1 | null = null;

  constructor(private readonly engine = timerEngine, private readonly now: () => number = () => Date.now()) {}

  private timers(): CountdownTimer[] {
    this.engine.check();
    return sortTimers(this.engine.timers(), this.now());
  }

  private view(): TimersListView {
    const timers = this.timers();
    this.selected = Math.min(this.selected, Math.max(0, timers.length - 1));
    if (!timers.length) this.confirm = null;
    return { timers, nowMs: this.now(), selected: this.selected, confirm: this.confirm };
  }

  /** A timer started ringing: show it and offer to dismiss it. */
  onEngineChanged(): void {
    const timers = this.timers();
    const ringing = timers.findIndex((timer) => timerPhase(timer) === "rung");
    if (ringing >= 0 && ringing !== this.selected) {
      this.selected = ringing;
      this.confirm = null;
    }
  }

  paint(ctx: LayerContext): GrayImage {
    const { width, height } = ctx.stack.getBaseSize();
    const image = new GrayImage(width, height);
    const view = this.view();
    this.scrollTop = listScrollTop(view.timers.length, view.selected, this.scrollTop);
    paintTimersList(image, terminalFace(), view, this.scrollTop);
    return image;
  }

  handleInput(event: InputEvent): void {
    const view = this.view();
    switch (event.type) {
      case "scroll-up":
      case "swipe-up":
        if (this.confirm !== null) this.confirm = 0;
        else this.selected = Math.max(0, this.selected - 1);
        return;
      case "scroll-down":
      case "swipe-down":
        if (this.confirm !== null) this.confirm = 1;
        else this.selected = Math.min(Math.max(0, view.timers.length - 1), this.selected + 1);
        return;
      case "click":
      case "swipe-right": {
        const timer = view.timers[this.selected];
        if (!timer) return;
        if (this.confirm === null) this.confirm = 0;
        else {
          if (this.confirm === 0) this.engine.removeTimer(timer.id);
          this.confirm = null;
        }
        return;
      }
      case "double-click":
      case "swipe-left":
        if (this.confirm !== null) this.confirm = null;
        else shell.yieldFocusToSidebar();
        return;
      default:
        return;
    }
  }
}
