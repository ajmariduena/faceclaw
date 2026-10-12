/**
 * Translate with no frame and no footer, laid out like Converse's live
 * facts: what the other person said in dim, its translation in white
 * underneath (final words white, the still-revisable tail gray), and the
 * exchange before it dimmer below when it fits. A dim status line appears
 * only when not translating ("· Paused"); "Stop and leave?" uses the nested
 * choice box. Pure painters over a Face, like the Paseo painter.
 */
import type { GrayImage } from "../../graphics/image";
import {
  CONTENT_TOP,
  FOOTER_TOP,
  LEFT,
  PITCH,
  RIGHT,
  fitLine,
  paintChoice,
  wrapCapped,
  wrapLines,
  type Face,
} from "../paseo/paseo-painter";
import type { TranslateSegment } from "./translate-model";

const ORIGINAL = 153;
const PENDING = 187;
const DIM = 120;
const PREVIOUS_ORIGINAL = 70;
const PREVIOUS_GAP = 18;
const ORIGINAL_LINES = 2;
const TRANSLATION_LINES = 3;

export type TranslateStatus = {
  /** "" while translating: nothing but the translation is drawn. */
  label: string;
  /** "· Paused" stands out in white; every other state is dim. */
  bright: boolean;
};

export type TranslateView = {
  segments: readonly TranslateSegment[];
  /** Segments scrolled back from the newest. */
  scrollBack: number;
  status: TranslateStatus;
  /** Shown in place of the conversation (missing key, mic busy, failure). */
  message: { title: string; detail: string } | null;
  /** "Stop and leave?" with the selected option. */
  leaving: { selected: number } | null;
};

export const LEAVE_OPTIONS = ["Keep listening", "Stop and leave"] as const;

type Run = { text: string; value: number };

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

/** Wrapped lines of `text` as runs: the first `settled` characters white, the rest gray. */
function settledRuns(lines: string[], text: string, settled: number): Run[][] {
  let cursor = 0;
  return lines.map((line) => {
    const ellipsis = line.startsWith("…") ? "…" : "";
    const body = line.slice(ellipsis.length);
    const start = text.indexOf(body, cursor);
    if (start < 0) return [{ text: line, value: 255 }];
    cursor = start + body.length;
    const white = Math.max(0, Math.min(body.length, settled - start));
    const runs: Run[] = [];
    if (ellipsis || white) runs.push({ text: ellipsis + body.slice(0, white), value: 255 });
    if (white < body.length) runs.push({ text: body.slice(white), value: PENDING });
    return runs;
  });
}

/** The newest exchange: original then translation, each its last lines while it grows. */
function currentLines(face: Face, segment: TranslateSegment): Run[][] {
  const width = RIGHT - LEFT;
  // Speech outside the pair is only transcribed, so it is the content itself.
  if (!segment.translated) return wrapTail(face, segment.original, width, ORIGINAL_LINES + TRANSLATION_LINES).map((text) => [{ text, value: 255 }]);
  const original = wrapTail(face, segment.original, width, ORIGINAL_LINES).map((text) => [{ text, value: ORIGINAL }]);
  if (!segment.translation) return original;
  return [...original, ...settledRuns(wrapTail(face, segment.translation, width, TRANSLATION_LINES), segment.translation, segment.settled)];
}

/** An earlier exchange in at most `rows` lines, its translation first to go short. */
function previousLines(face: Face, segment: TranslateSegment, rows: number): Run[][] {
  const width = RIGHT - LEFT;
  if (rows <= 0) return [];
  if (!segment.translated || !segment.translation) {
    return wrapCapped(face, segment.original, width, Math.min(rows, 2)).map((text) => [{ text, value: segment.translated ? PREVIOUS_ORIGINAL : DIM }]);
  }
  const original = rows > 1 ? [[{ text: fitLine(face, segment.original, width), value: PREVIOUS_ORIGINAL }]] : [];
  const translation = wrapCapped(face, segment.translation, width, Math.min(rows - original.length, 2)).map((text) => [{ text, value: DIM }]);
  return [...original, ...translation];
}

function drawRuns(image: GrayImage, face: Face, lines: Run[][], top: number): number {
  let y = top;
  for (const line of lines) {
    let x = LEFT;
    for (const run of line) {
      face.drawText(image, x, y, run.text, run.value);
      x += face.measureLine(run.text);
    }
    y += PITCH;
  }
  return y;
}

/** How far back the ring can scroll: every segment but the first can be the one shown. */
export function translateMaxScrollBack(view: Pick<TranslateView, "segments">): number {
  return Math.max(0, view.segments.length - 1);
}

export function paintTranslate(image: GrayImage, face: Face, view: TranslateView): void {
  if (view.leaving) {
    const newest = view.segments[view.segments.length - 1];
    const context = newest ? newest.translation || newest.original : "";
    paintChoice(image, face, {
      heading: context ? { text: context, value: DIM, maxLines: 2, gap: 9 } : null,
      question: "Stop and leave?",
      rows: LEAVE_OPTIONS.map((label) => ({ label })),
      selected: view.leaving.selected,
      footer: { left: "", right: "" },
    });
    return;
  }
  if (view.message) {
    face.drawText(image, LEFT, CONTENT_TOP, fitLine(face, view.message.title, RIGHT - LEFT), 255);
    wrapCapped(face, view.message.detail, RIGHT - LEFT, 3)
      .forEach((line, index) => face.drawText(image, LEFT, CONTENT_TOP + (index + 1) * PITCH, line, DIM));
  } else {
    const index = view.segments.length - 1 - Math.min(view.scrollBack, translateMaxScrollBack(view));
    const shown = view.segments[index];
    const previous = view.segments[index - 1];
    if (shown) {
      const bottom = drawRuns(image, face, currentLines(face, shown), CONTENT_TOP);
      const top = bottom + PREVIOUS_GAP;
      if (previous) drawRuns(image, face, previousLines(face, previous, Math.floor((FOOTER_TOP - top) / PITCH)), top);
    }
  }
  if (view.status.label) {
    face.drawText(image, LEFT, FOOTER_TOP + 8, fitLine(face, view.status.label, RIGHT - LEFT), view.status.bright ? 255 : DIM);
  }
}
