/**
 * Translate with no frame and no footer, so it stays out of the way during a
 * conversation: only the utterance being translated, final words white and
 * the still-revisable tail gray. A dim status line appears only when not
 * translating ("· Paused"); "Stop and leave?" uses the nested choice box.
 * Pure painters over a Face, like the Paseo painter.
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
  wrapCapped,
  wrapLines,
  type Face,
} from "../paseo/paseo-painter";
import type { TranslateSegment } from "./translate-model";

const ORIGINAL = 120;
const PENDING = 187;
const LINES = 3;

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

function segmentLines(face: Face, segment: TranslateSegment): Run[][] {
  const width = RIGHT - LEFT;
  if (segment.translation) return settledRuns(wrapTail(face, segment.translation, width, LINES), segment.translation, segment.settled);
  // Speech outside the pair is only transcribed, so it is the content itself;
  // otherwise the original stands in, dim, until the first translated word.
  const value = segment.translated ? ORIGINAL : 255;
  return wrapTail(face, segment.original, width, LINES).map((text) => [{ text, value }]);
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
      heading: context ? { text: context, value: ORIGINAL, maxLines: 2, gap: 9 } : null,
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
      .forEach((line, index) => face.drawText(image, LEFT, CONTENT_TOP + (index + 1) * PITCH, line, ORIGINAL));
  } else {
    const shown = view.segments[view.segments.length - 1 - Math.min(view.scrollBack, translateMaxScrollBack(view))];
    const lines = shown ? segmentLines(face, shown) : [];
    let y = CONTENT_BOTTOM - lines.length * PITCH;
    for (const line of lines) {
      let x = LEFT;
      for (const run of line) {
        face.drawText(image, x, y, run.text, run.value);
        x += face.measureLine(run.text);
      }
      y += PITCH;
    }
  }
  if (view.status.label) {
    face.drawText(image, LEFT, FOOTER_TOP + 8, fitLine(face, view.status.label, RIGHT - LEFT), view.status.bright ? 255 : ORIGINAL);
  }
}
