/**
 * Live facts with no frame and no footer, like Translate: the newest fact in
 * white under its topic in dim, the one before it dimmer underneath when it
 * fits, and a faint "· Live facts" while listening with nothing to show yet.
 */
import type { GrayImage } from "../../graphics/image";
import { CONTENT_TOP, FOOTER_TOP, LEFT, PITCH, RIGHT, fitLine, wrapCapped, wrapLines, type Face } from "../paseo/paseo-painter";
import type { Fact } from "./converse-facts";

const DIM = 153;
const FAINT = 85;
const PREVIOUS = 120;
const PREVIOUS_TOPIC = 70;
const PREVIOUS_GAP = 18;

export type ConverseView = {
  fact: Fact | null;
  previous: Fact | null;
  /** "" draws nothing; "· Paused" stands out in white. */
  status: { label: string; bright: boolean };
  /** Shown in place of the fact (missing key, mic busy, failure). */
  message: { title: string; detail: string } | null;
};

export function paintConverse(image: GrayImage, face: Face, view: ConverseView): void {
  const width = RIGHT - LEFT;
  if (view.message) {
    face.drawText(image, LEFT, CONTENT_TOP, fitLine(face, view.message.title, width), 255);
    wrapCapped(face, view.message.detail, width, 3)
      .forEach((line, index) => face.drawText(image, LEFT, CONTENT_TOP + (index + 1) * PITCH, line, DIM));
  } else if (view.fact) {
    const bottom = paintFact(image, face, view.fact, CONTENT_TOP, DIM, 255, FOOTER_TOP);
    if (view.previous) paintFact(image, face, view.previous, bottom + PREVIOUS_GAP, PREVIOUS_TOPIC, PREVIOUS, FOOTER_TOP);
  }
  if (view.status.label) {
    face.drawText(image, LEFT, FOOTER_TOP + 8, fitLine(face, view.status.label, width), view.status.bright ? 255 : FAINT);
  }
}

/** Topic line then the whole fact; nothing when it would run past `limit`. Returns the y below it. */
function paintFact(image: GrayImage, face: Face, fact: Fact, top: number, topicValue: number, textValue: number, limit: number): number {
  const lines = wrapLines(face, fact.text, RIGHT - LEFT);
  const bottom = top + (lines.length + 1) * PITCH + 4;
  if (bottom > limit && top > CONTENT_TOP) return top;
  if (fact.topic) face.drawText(image, LEFT, top, fitLine(face, fact.topic, RIGHT - LEFT), topicValue);
  lines.forEach((line, index) => face.drawText(image, LEFT, top + (index + 1) * PITCH + 4, line, textValue));
  return bottom;
}
