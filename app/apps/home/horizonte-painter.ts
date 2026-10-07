import { GrayImage } from "../../graphics/image";
import type { HomeFace } from "./home-painter";
import type { HorizonteClock } from "./home-model";

export function paintHorizonte(state: HorizonteClock, face: HomeFace, clockFace: HomeFace): GrayImage {
  // The selected prototype moved the card to x=250; the app keeps its dots at x=218 and card at x=230.
  const image = new GrayImage(212, 288);
  const text = (font: HomeFace, x: number, y: number, label: string, value: number) => {
    const width = image.width - x;
    if (font.measureLine(label) > width) {
      const chars = Array.from(label);
      while (chars.length && font.measureLine(chars.join("") + "…") > width) chars.pop();
      label = chars.join("").trimEnd() + "…";
    }
    font.drawText(image, x, y, label, value);
  };
  text(clockFace, 14, 23, state.time, 255);
  text(face, 18, 118, state.date, 204);
  image.fillRect(18, 161, 194, 1, 85);
  if (state.eventLine) text(face, 18, 181, state.eventLine, 221);
  if (state.nextLine) text(face, 18, 211, state.nextLine, 255);
  if (state.title) text(face, 18, state.nextLine ? 241 : 214, state.title, 255);
  return image.withDrawsBaked();
}
