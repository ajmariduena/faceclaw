import { GrayImage } from "../../graphics/image";
import { getStringSetting } from "../../native/settings-store";
import {
  BRIGHTNESS_VALUES,
  brightnessLabel,
  brightnessSetting,
  screenTimeoutLabel,
  screenTimeoutSetting,
  sonioxApiKeySetting,
  uiDepthSetting,
  type BrightnessSetting,
  type ScreenTimeoutSetting,
  type UiDepth,
} from "../../ui/dashboard-settings";
import type { InputEvent } from "../../ui/gestures";
import type { Layer, LayerContext } from "../../ui/layers";
import { shell } from "../../ui/shell/shell";
import { readWorkerState } from "../../ui/shell/worker-state";
import {
  listScrollTop,
  paintTerminalList,
  stepSelection,
  type TerminalRow,
} from "../../ui/terminal";
import { terminalFace } from "../../ui/terminal-face";
import { PASEO_GLANCE_STATE_KEY, type PaseoGlanceSnapshot } from "../paseo/paseo-glance";

/** The phone's last test of a service key (see research/lean-spec.md, API keys). */
export type KeyTestStatus = {
  state: "ok" | "failed" | "missing" | "untested";
  at: number;
  ms: number | null;
  error: string | null;
};

export const API_KEY_STATUS_PREFIX = "apiKeys.status.";

/** The phone's stored test result for a service, or null when none (or unreadable). */
export function readKeyTestStatus(service: string, read: (key: string, fallback: string) => string = getStringSetting): KeyTestStatus | null {
  const raw = read(`${API_KEY_STATUS_PREFIX}${service}`, "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<KeyTestStatus>;
    return parsed && ["ok", "failed", "missing", "untested"].includes(parsed.state as string)
      ? { state: parsed.state as KeyTestStatus["state"], at: Number(parsed.at) || 0, ms: parsed.ms ?? null, error: parsed.error ?? null }
      : null;
  } catch {
    return null;
  }
}

/** "ok" / "failed" / "missing" / "untested"; a key known to be absent is missing whatever the last test said. */
export function keyStatusValue(hasKey: boolean | null, status: KeyTestStatus | null): string {
  if (hasKey === false) return "missing";
  if (!status) return "untested";
  return status.state;
}

export type StatusSnapshot = {
  glasses: number | null;
  ring: number | null;
  paseo: "connected" | "unreachable" | "not paired";
  keys: readonly { label: string; value: string }[];
  brightness: BrightnessSetting;
  screenTimeout: ScreenTimeoutSetting;
  depth: UiDepth;
};

export const BRIGHTNESS_ROW = 6;
export const SCREEN_OFF_ROW = 7;
export const DISTANCE_ROW = 8;
export const DISCONNECT_ROW = 9;

type Adjustable = { row: number; footer: string; values: readonly string[]; get: () => string; set: (value: string) => void };

/** Rows a tap puts into scroll-to-adjust; scroll-up moves to the next value (brighter, longer, farther). */
const ADJUSTABLE: readonly Adjustable[] = [
  { row: BRIGHTNESS_ROW, footer: "· Brightness", get values() { return BRIGHTNESS_VALUES; },
    get: () => brightnessSetting.get(), set: (value) => brightnessSetting.set(value as BrightnessSetting) },
  { row: SCREEN_OFF_ROW, footer: "· Screen off", get values() { return screenTimeoutSetting.values; },
    get: () => screenTimeoutSetting.get(), set: (value) => screenTimeoutSetting.set(value as ScreenTimeoutSetting) },
  { row: DISTANCE_ROW, footer: "· Distance", get values() { return [...uiDepthSetting.values].reverse(); },
    get: () => uiDepthSetting.get(), set: (value) => uiDepthSetting.set(value as UiDepth) },
];

/** Depth as a 1 (nearest) to 9 (farthest) level, the way the Even app shows its distance slider. */
export function distanceLabel(depth: UiDepth, values: readonly string[] = uiDepthSetting.values): string {
  return String(values.length - values.indexOf(depth));
}

export function statusRows(snapshot: StatusSnapshot): TerminalRow[] {
  const percent = (level: number | null) => (level === null ? "n/a" : `${level}%`);
  return [
    { label: "Glasses battery", value: percent(snapshot.glasses), selectable: false },
    { label: "Ring battery", value: percent(snapshot.ring), selectable: false },
    { label: "Paseo", value: snapshot.paseo, selectable: false },
    ...snapshot.keys.map((key) => ({ label: key.label, value: key.value, selectable: false })),
    { label: "Brightness", value: brightnessLabel(snapshot.brightness) },
    { label: "Screen off", value: snapshot.screenTimeout === "never" ? "Never" : `after ${screenTimeoutLabel(snapshot.screenTimeout)}` },
    { label: "Distance", value: distanceLabel(snapshot.depth) },
    { label: "Disconnect" },
  ];
}

export function paseoStatus(snapshot: PaseoGlanceSnapshot | null | undefined): StatusSnapshot["paseo"] {
  if (!snapshot || !snapshot.configured) return "not paired";
  return snapshot.status ? "unreachable" : "connected";
}

function readSnapshot(): StatusSnapshot {
  const battery = shell.getBatteryLevels();
  // Only Soniox's key lives in a setting this build knows; the others report what the phone last tested.
  const soniox = sonioxApiKeySetting.get().trim().length > 0;
  return {
    glasses: battery.headset,
    ring: battery.ring,
    paseo: paseoStatus(readWorkerState(PASEO_GLANCE_STATE_KEY) as PaseoGlanceSnapshot | undefined),
    keys: [
      { label: "Soniox", value: keyStatusValue(soniox, readKeyTestStatus("soniox")) },
      { label: "OpenRouter", value: keyStatusValue(null, readKeyTestStatus("openrouter")) },
      { label: "Parallel", value: keyStatusValue(null, readKeyTestStatus("parallel")) },
    ],
    brightness: brightnessSetting.get(),
    screenTimeout: screenTimeoutSetting.get(),
    depth: uiDepthSetting.get(),
  };
}

/** The glasses Settings app: status rows, adjustable rows (tap, then scroll) and Disconnect. */
export class StatusLayer implements Layer {
  readonly acceptsDirectional = true;
  private selected = BRIGHTNESS_ROW;
  private scrollTop = 0;
  /** The row whose value scroll adjusts instead of moving the selection. */
  private adjusting: Adjustable | null = null;

  constructor(private readonly snapshot: () => StatusSnapshot = readSnapshot) {}

  get isAdjusting(): boolean {
    return this.adjusting !== null;
  }

  paint(ctx: LayerContext): GrayImage {
    const { width, height } = ctx.stack.getBaseSize();
    const image = new GrayImage(width, height);
    const rows = statusRows(this.snapshot());
    this.scrollTop = listScrollTop(rows.length, this.selected, this.scrollTop);
    paintTerminalList(image, terminalFace(), {
      rows,
      selected: this.selected,
      footer: { left: this.adjusting?.footer ?? "· Settings", right: "" },
    }, this.scrollTop);
    return image;
  }

  private step(adjustable: Adjustable, direction: -1 | 1): void {
    const { values } = adjustable;
    const current = adjustable.get();
    const next = values[Math.min(values.length - 1, Math.max(0, values.indexOf(current) + direction))];
    if (next !== undefined && next !== current) adjustable.set(next);
  }

  async handleInput(event: InputEvent, ctx: LayerContext): Promise<void> {
    const rows = statusRows(this.snapshot());
    switch (event.type) {
      case "scroll-up":
      case "swipe-up":
        if (this.adjusting) this.step(this.adjusting, 1);
        else this.selected = stepSelection(rows, this.selected, -1);
        return;
      case "scroll-down":
      case "swipe-down":
        if (this.adjusting) this.step(this.adjusting, -1);
        else this.selected = stepSelection(rows, this.selected, 1);
        return;
      case "click":
      case "swipe-right":
        if (this.adjusting) this.adjusting = null;
        else if (ADJUSTABLE.some((a) => a.row === this.selected)) this.adjusting = ADJUSTABLE.find((a) => a.row === this.selected)!;
        else if (this.selected === DISCONNECT_ROW) await ctx.actions.disconnect();
        return;
      case "double-click":
      case "swipe-left":
        if (this.adjusting) this.adjusting = null;
        else shell.yieldFocusToSidebar();
        return;
      default:
        return;
    }
  }
}
