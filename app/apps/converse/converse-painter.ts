/**
 * Live facts with no frame and no footer, like Translate: the newest fact in
 * white under its topic and source in dim, and a faint "· Live facts" while
 * listening with nothing to show yet.
 */
import type { GrayImage } from "../../graphics/image";
import { CONTENT_TOP, FOOTER_TOP, LEFT, PITCH, RIGHT, fitLine, wrapCapped, wrapLines, type Face } from "../paseo/paseo-painter";
import type { Fact } from "./converse-facts";

const DIM = 153;
const FAINT = 85;

export type ConverseView = {
  fact: Fact | null;
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
    const header = [view.fact.topic, view.fact.source].filter(Boolean).join(" · ");
    face.drawText(image, LEFT, CONTENT_TOP, fitLine(face, header, width), DIM);
    wrapLines(face, view.fact.text, width)
      .forEach((line, index) => face.drawText(image, LEFT, CONTENT_TOP + (index + 1) * PITCH + 4, line, 255));
  }
  if (view.status.label) {
    face.drawText(image, LEFT, FOOTER_TOP + 8, fitLine(face, view.status.label, width), view.status.bright ? 255 : FAINT);
  }
}
