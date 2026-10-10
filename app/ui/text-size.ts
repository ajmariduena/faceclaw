import { textSizeSetting } from "./dashboard-settings";

export type TextMetrics = {
  /** Row pitch of terminal-frame screens. */
  pitch: number;
  /** Roboto size replacing Even's 20 px font, or null for the stock font. */
  sizePx: number | null;
};

const METRICS = {
  normal: { pitch: 27, sizePx: null },
  large: { pitch: 34, sizePx: 26 },
  larger: { pitch: 37, sizePx: 28 },
} as const satisfies Record<string, TextMetrics>;

export function textMetrics(): TextMetrics {
  return METRICS[textSizeSetting.get()] ?? METRICS.normal;
}

/** The footer holds one line at the row pitch plus the rule's padding (40 px at the stock 27). */
export function footerHeight(pitch: number): number {
  return pitch + 13;
}
