/**
 * Translate in the terminal-mode frame: the newest translation in white with
 * what was actually said dim under it, older exchanges above, newest at the
 * bottom; "· Translating  ES ⇄ EN  0:42" in the footer; "Stop and leave?" in
 * the nested choice box. Pure painters over a Face, like the Paseo painter.
 */
import type { GrayImage } from "../../graphics/image";
import {
  CONTENT_BOTTOM,
  CONTENT_TOP,
  FOOTER_TOP,
  LEFT,
  PITCH,
  RIGHT,
  fitLine,
  paintChoice,
  paintFrame,
  wrapCapped,
  wrapLines,
  type Face,
} from "../paseo/paseo-painter";
import type { TranslateSegment } from "./translate-model";

const RULE = 119;
const ORIGINAL = 120;
const OLDER = 187;
const OLDER_ORIGINAL = 102;
const BLOCK_GAP = 12;
const NEWEST_LINES = 4;
const NEWEST_ORIGINAL_LINES = 2;
const OLDER_LINES = 2;
const ARROW_WIDTH = 20;

export type TranslateFooter = {
  label: string;
  /** "· Paused" stands out in white; every other state is dim. */
  bright: boolean;
  elapsed: string;
};

export type TranslateView = {
  segments: readonly TranslateSegment[];
  /** Segments scrolled back from the newest. */
  scrollBack: number;
  footer: TranslateFooter;
  /** Shown in place of the conversation (missing key, mic busy, failure). */
  message: { title: string; detail: string } | null;
  /** "Stop and leave?" with the selected option. */
  leaving: { selected: number } | null;
};

export const LEAVE_OPTIONS = ["Keep listening", "Stop and leave"] as const;

type Block = { lines: { text: string; value: number }[] };

/** The last `max` wrapped lines, the first marked "…" when earlier text was cut. */
function wrapTail(face: Face, text: string, width: number, max: number): string[] {
  const lines = wrapLines(face, text, width);
  if (lines.length <= max) return lines;
  const kept = lines.slice(-max);
  let first = kept[0]!;
  while (first.includes(" ") && face.measureLine(`…${first}`) > width) first = first.slice(first.indexOf(" ") + 1);
  kept[0] = face.measureLine(`…${first}`) <= width ? `…${first}` : first;
  return kept;
}

function segmentBlock(face: Face, segment: TranslateSegment, newest: boolean): Block {
  const width = RIGHT - LEFT;
  // Speech outside the pair is only transcribed: it is the content itself.
  const primary = segment.translation || (segment.translated ? "" : segment.original);
  const secondary = primary === segment.original ? "" : segment.original;
  const lines: Block["lines"] = [];
  if (newest) {
    for (const text of wrapTail(face, primary, width, NEWEST_LINES)) lines.push({ text, value: 255 });
    for (const text of wrapTail(face, secondary, width, NEWEST_ORIGINAL_LINES)) lines.push({ text, value: ORIGINAL });
  } else {
    for (const text of wrapCapped(face, primary, width, OLDER_LINES)) lines.push({ text, value: OLDER });
    for (const text of wrapCapped(face, secondary, width, 1)) lines.push({ text, value: OLDER_ORIGINAL });
  }
  return { lines };
}

/** How far back the ring can scroll: every segment but the first can be the bottom one. */
export function translateMaxScrollBack(view: Pick<TranslateView, "segments">): number {
  return Math.max(0, view.segments.length - 1);
}

export function paintTranslate(image: GrayImage, face: Face, view: TranslateView): void {
  if (view.leaving) {
    const newest = view.segments[view.segments.length - 1];
    const context = newest ? newest.translation || newest.original : "";
    paintChoice(image, face, {
      heading: context ? { text: context, value: ORIGINAL, maxLines: 2, gap: 9 } : null,
      question: "Stop and leave?",
      rows: LEAVE_OPTIONS.map((label) => ({ label })),
      selected: view.leaving.selected,
      footer: { left: "", right: "" },
    });
    paintFooterText(image, face, view.footer);
    return;
  }
  paintFrame(image);
  if (view.message) {
    face.drawText(image, LEFT, CONTENT_TOP, fitLine(face, view.message.title, RIGHT - LEFT), 255);
    wrapCapped(face, view.message.detail, RIGHT - LEFT, 3)
      .forEach((line, index) => face.drawText(image, LEFT, CONTENT_TOP + (index + 1) * PITCH, line, ORIGINAL));
  } else {
    const end = Math.max(0, view.segments.length - Math.min(view.scrollBack, translateMaxScrollBack(view)));
    let bottom = CONTENT_BOTTOM;
    for (let index = end - 1; index >= 0; index--) {
      const block = segmentBlock(face, view.segments[index]!, index === end - 1);
      const height = block.lines.length * PITCH;
      if (!block.lines.length) continue;
      if (bottom - height < CONTENT_TOP) {
        // Only whole blocks; the newest keeps its last lines when even it does not fit.
        if (index !== end - 1) break;
        block.lines.splice(0, Math.ceil((CONTENT_TOP - (bottom - height)) / PITCH));
      }
      let y = bottom - block.lines.length * PITCH;
      for (const line of block.lines) {
        face.drawText(image, LEFT, y, line.text, line.value);
        y += PITCH;
      }
      bottom -= block.lines.length * PITCH + BLOCK_GAP;
    }
  }
  image.fillRect(14, FOOTER_TOP, 548, 1, RULE);
  paintFooterText(image, face, view.footer);
}

/** Label, the language pair with a drawn ⇄ (the stock font has no arrows), and the elapsed time. */
function paintFooterText(image: GrayImage, face: Face, footer: TranslateFooter): void {
  const y = FOOTER_TOP + 8;
  const label = fitLine(face, footer.label, 220);
  face.drawText(image, LEFT, y, label, footer.bright ? 255 : RULE);
  let x = LEFT + face.measureLine(label) + face.measureLine("  ");
  face.drawText(image, x, y, "ES ", RULE);
  x += face.measureLine("ES ");
  drawSwapArrow(image, x, y, RULE);
  face.drawText(image, x + ARROW_WIDTH, y, " EN", RULE);
  if (footer.elapsed) face.drawText(image, RIGHT - face.measureLine(footer.elapsed), y, footer.elapsed, RULE);
}

/** A right arrow over a left arrow, sized to the stock font's x-height. */
function drawSwapArrow(image: GrayImage, x: number, y: number, value: number): void {
  image.fillRect(x, y + 7, 18, 2, value);
  image.fillRect(x + 2, y + 15, 18, 2, value);
  for (let step = 0; step < 3; step++) {
    image.fillRect(x + 12 + step * 2, y + 3 + step * 2, 2, 2, value);
    image.fillRect(x + 12 + step * 2, y + 11 - step * 2, 2, 2, value);
    image.fillRect(x + 2 + step * 2, y + 15 + step * 2, 2, 2, value);
    image.fillRect(x + 2 + step * 2, y + 15 - step * 2, 2, 2, value);
  }
}
