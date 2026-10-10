/**
 * Even's terminal-mode frame for the lean build's list screens (More,
 * Settings, Timers, Converse): one rounded 1 px box over the 576×288 band,
 * the stock font at a 27 px pitch, white content, dim secondaries, ">" on
 * the selected row, a thin rule above the status footer and no gesture
 * hints. Same geometry as app/apps/paseo/paseo-painter.ts; pure painters
 * over a Face (terminal-face.ts picks the font) so the headless renderer
 * draws what the glasses show.
 */
import type { GrayImage } from "../graphics/image";

export type Face = {
  readonly lineHeight: number;
  measureLine(text: string): number;
  drawText(image: GrayImage, x: number, y: number, text: string, value?: number): void;
};

export let PITCH = 27;
export let FOOTER_TOP = 288 - 4 - (PITCH + 13);
export const CONTENT_TOP = 14;
export const LEFT = 22;
export const RIGHT = 554;
export const RULE_VALUE = 119;
export const DIM = 136;
export let LIST_CAPACITY = Math.floor((FOOTER_TOP - CONTENT_TOP) / PITCH);

/** Settings > Text size: the row pitch the lean list screens lay out with (27 for Even's 20 px font). */
export function applyTextLayout(pitch: number): void {
  PITCH = pitch;
  FOOTER_TOP = 288 - 4 - (pitch + 13);
  LIST_CAPACITY = Math.floor((FOOTER_TOP - CONTENT_TOP) / pitch);
}

export function fitLine(face: Face, text: string, width: number): string {
  const clean = text.replace(/[\r\n\t]/g, " ");
  if (face.measureLine(clean) <= width) return clean;
  const chars = Array.from(clean);
  while (chars.length && face.measureLine(`${chars.join("").trimEnd()}…`) > width) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}

export function paintFrame(image: GrayImage): void {
  image.drawRoundedRect(4, 4, 568, 280, 255, 8);
}

export function paintFooter(image: GrayImage, face: Face, left: string, right: string): void {
  image.fillRect(14, FOOTER_TOP, 548, 1, RULE_VALUE);
  const leftText = left ? fitLine(face, left, 300) : "";
  if (leftText) face.drawText(image, LEFT, FOOTER_TOP + 8, leftText, RULE_VALUE);
  if (right) {
    const text = fitLine(face, right, RIGHT - LEFT - (leftText ? face.measureLine(leftText) + 16 : 0));
    face.drawText(image, RIGHT - face.measureLine(text), FOOTER_TOP + 8, text, RULE_VALUE);
  }
}

export type TerminalRow = {
  label: string;
  /** Right-aligned, dim. */
  value?: string;
  /** Informational rows never take the ">". */
  selectable?: boolean;
};

export type TerminalListView = {
  rows: readonly TerminalRow[];
  /** Index into rows of the selected row (-1 for none). */
  selected: number;
  footer: { left: string; right: string };
  /** Dim message instead of rows (an empty list). */
  message?: string;
};

/** The first visible row so the selection is on screen. */
export function listScrollTop(count: number, selected: number, previousTop: number, capacity = LIST_CAPACITY): number {
  const maxTop = Math.max(0, count - capacity);
  let top = Math.min(Math.max(0, previousTop), maxTop);
  if (selected < 0) return top;
  if (selected < top) top = selected;
  if (selected >= top + capacity) top = selected - capacity + 1;
  return Math.min(Math.max(0, top), maxTop);
}

/** The next selectable row from `selected` in `direction`, or `selected` at the end of the list. */
export function stepSelection(rows: readonly TerminalRow[], selected: number, direction: -1 | 1): number {
  for (let index = selected + direction; index >= 0 && index < rows.length; index += direction) {
    if (rows[index]!.selectable !== false) return index;
  }
  return selected;
}

export function paintTerminalList(image: GrayImage, face: Face, view: TerminalListView, scrollTop = 0): void {
  paintFrame(image);
  if (view.message) {
    face.drawText(image, LEFT, CONTENT_TOP, fitLine(face, view.message, RIGHT - LEFT), DIM);
  } else {
    let y = CONTENT_TOP;
    for (let index = scrollTop; index < view.rows.length && y + PITCH <= FOOTER_TOP; index++) {
      const row = view.rows[index]!;
      const selected = index === view.selected;
      if (selected) face.drawText(image, LEFT, y, ">", 255);
      const value = row.value ? fitLine(face, row.value, 220) : "";
      if (value) face.drawText(image, RIGHT - face.measureLine(value), y, value, selected ? 255 : DIM);
      const labelWidth = RIGHT - 42 - (value ? face.measureLine(value) + 16 : 0);
      face.drawText(image, 42, y, fitLine(face, row.label, labelWidth), selected || row.selectable === false ? 255 : DIM);
      y += PITCH;
    }
  }
  paintFooter(image, face, view.footer.left, view.footer.right);
}
