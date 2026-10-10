import { GrayImage } from "../../graphics/image";
import { getStringSetting } from "../../native/settings-store";
import {
  BRIGHTNESS_VALUES,
  brightnessLabel,
  brightnessSetting,
  sonioxApiKeySetting,
  type BrightnessSetting,
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
};

export const BRIGHTNESS_ROW = 6;
export const DISCONNECT_ROW = 7;

export function statusRows(snapshot: StatusSnapshot): TerminalRow[] {
  const percent = (level: number | null) => (level === null ? "n/a" : `${level}%`);
  return [
    { label: "Glasses battery", value: percent(snapshot.glasses), selectable: false },
    { label: "Ring battery", value: percent(snapshot.ring), selectable: false },
    { label: "Paseo", value: snapshot.paseo, selectable: false },
    ...snapshot.keys.map((key) => ({ label: key.label, value: key.value, selectable: false })),
    { label: "Brightness", value: brightnessLabel(snapshot.brightness) },
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
  };
}

/** The glasses Settings app: status rows, a brightness row (tap, then scroll) and Disconnect. */
export class StatusLayer implements Layer {
  readonly acceptsDirectional = true;
  private selected = BRIGHTNESS_ROW;
  private scrollTop = 0;
  /** Scroll adjusts brightness instead of moving the selection. */
  private adjusting = false;

  constructor(private readonly snapshot: () => StatusSnapshot = readSnapshot) {}

  get isAdjusting(): boolean {
    return this.adjusting;
  }

  paint(ctx: LayerContext): GrayImage {
    const { width, height } = ctx.stack.getBaseSize();
    const image = new GrayImage(width, height);
    const rows = statusRows(this.snapshot());
    this.scrollTop = listScrollTop(rows.length, this.selected, this.scrollTop);
    paintTerminalList(image, terminalFace(), {
      rows,
      selected: this.selected,
      footer: { left: this.adjusting ? "· Brightness" : "· Settings", right: "" },
    }, this.scrollTop);
    return image;
  }

  private stepBrightness(direction: -1 | 1): void {
    const index = BRIGHTNESS_VALUES.indexOf(brightnessSetting.get());
    const next = BRIGHTNESS_VALUES[Math.min(BRIGHTNESS_VALUES.length - 1, Math.max(0, index + direction))];
    if (next !== undefined && next !== brightnessSetting.get()) brightnessSetting.set(next);
  }

  async handleInput(event: InputEvent, ctx: LayerContext): Promise<void> {
    const rows = statusRows(this.snapshot());
    switch (event.type) {
      case "scroll-up":
      case "swipe-up":
        if (this.adjusting) this.stepBrightness(1);
        else this.selected = stepSelection(rows, this.selected, -1);
        return;
      case "scroll-down":
      case "swipe-down":
        if (this.adjusting) this.stepBrightness(-1);
        else this.selected = stepSelection(rows, this.selected, 1);
        return;
      case "click":
      case "swipe-right":
        if (this.selected === BRIGHTNESS_ROW) this.adjusting = !this.adjusting;
        else if (this.selected === DISCONNECT_ROW) await ctx.actions.disconnect();
        return;
      case "double-click":
      case "swipe-left":
        if (this.adjusting) this.adjusting = false;
        else shell.yieldFocusToSidebar();
        return;
      default:
        return;
    }
  }
}
