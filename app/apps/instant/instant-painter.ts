/**
 * Instant in the Live facts style: no frame and no footer. The newest
 * question (dim) and its answer (white, one sentence per line) sit at the
 * bottom; earlier turns stack above, dimmer. While listening, the words being
 * heard show in white. A faint status line marks the state.
 */
import type { GrayImage } from "../../graphics/image";
import { CONTENT_TOP, FOOTER_TOP, LEFT, PITCH, RIGHT, fitLine, wrapCapped, wrapLines, type Face } from "../paseo/paseo-painter";

const WHITE = 255;
const DIM = 153;
const PREVIOUS = 120;
const OLDER = 85;
const FAINT = 85;
const TURN_GAP = 14;

export type InstantViewTurn = { question: string; answer: string };
export type InstantView = {
  /** Oldest first; the last one is the newest. */
  turns: InstantViewTurn[];
  /** Words still being spoken: the newest question, in white. */
  live: string;
  status: string;
  message: { title: string; detail: string } | null;
  /** Rows scrolled back from the newest. */
  scrollBack: number;
};

type Row = { text: string; value: number; gapBefore: number };

export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+(?=[¿¡A-ZÁÉÍÓÚÑ0-9"«])/).map((s) => s.trim()).filter(Boolean);
}

export function instantRows(face: Face, view: InstantView): Row[] {
  const width = RIGHT - LEFT;
  const rows: Row[] = [];
  const turns = view.turns;
  turns.forEach((turn, index) => {
    const age = turns.length - 1 - index + (view.live ? 1 : 0);
    const [questionValue, answerValue] = age === 0 ? [DIM, WHITE] : age === 1 ? [OLDER, PREVIOUS] : [OLDER, OLDER];
    wrapLines(face, turn.question, width).forEach((text, i) => rows.push({ text, value: questionValue, gapBefore: i === 0 && rows.length ? TURN_GAP : 0 }));
    let first = true;
    for (const sentence of sentences(turn.answer)) {
      for (const text of wrapLines(face, sentence, width)) {
        rows.push({ text, value: answerValue, gapBefore: first ? 6 : 0 });
        first = false;
      }
    }
  });
  if (view.live) wrapLines(face, view.live, width).forEach((text, i) => rows.push({ text, value: WHITE, gapBefore: i === 0 && rows.length ? TURN_GAP : 0 }));
  return rows;
}

export function instantMaxScrollBack(face: Face, view: InstantView): number {
  const rows = instantRows(face, view);
  const fits = Math.floor((FOOTER_TOP - CONTENT_TOP) / PITCH);
  return Math.max(0, rows.length - fits);
}

export function paintInstant(image: GrayImage, face: Face, view: InstantView): void {
  const width = RIGHT - LEFT;
  if (view.message) {
    face.drawText(image, LEFT, CONTENT_TOP, fitLine(face, view.message.title, width), WHITE);
    wrapCapped(face, view.message.detail, width, 3).forEach((line, index) => face.drawText(image, LEFT, CONTENT_TOP + (index + 1) * PITCH, line, DIM));
  } else {
    const rows = instantRows(face, view);
    const visible = rows.slice(0, Math.max(0, rows.length - view.scrollBack));
    let bottom = FOOTER_TOP;
    for (let i = visible.length - 1; i >= 0; i--) {
      const row = visible[i];
      const top = bottom - PITCH;
      if (top < CONTENT_TOP) break;
      face.drawText(image, LEFT, top, row.text, row.value);
      bottom = top - row.gapBefore;
    }
  }
  if (view.status) face.drawText(image, LEFT, FOOTER_TOP + 8, fitLine(face, view.status, width), FAINT);
}
