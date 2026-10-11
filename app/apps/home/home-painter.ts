import * as graphics from "../../graphics/image";
import type { GrayImage } from "../../graphics/image";
import { HOME_CARDS, homeColumnState, emptyCardStatus, clockTime, type HomeBattery, type HomeCalendar } from "./home-model";
import { renderIcon, type IconName } from "../../graphics/icons";
import { dotNumberWidth, paintDotNumber, paintHomeColumn } from "./column-painter";
import type { HomeWeatherReading } from "./home-weather";
import { glanceCounts, glanceEmptyStatus, type PaseoGlanceSnapshot } from "../paseo/paseo-glance";
import type { BotsGlance } from "../bots/bots-model";

export type HomeFace = {
  readonly lineHeight: number;
  measureLine(text: string): number;
  drawText(image: GrayImage, x: number, y: number, text: string, value?: number): void;
};
export type HomeSnapshot = {
  now: Date;
  calendar: HomeCalendar;
  /** What the Paseo worker last published; null before it publishes (or when the app never ran). */
  paseo?: PaseoGlanceSnapshot | null;
  bots?: BotsGlance | null;
  /** A Soniox key is stored, so Translate can start. */
  translateReady?: boolean;
  /** Ring and glasses levels from the shell; null (or absent) while unknown. */
  battery?: HomeBattery;
  /** The last Open-Meteo reading; null (or absent) hides the complication. */
  weather?: HomeWeatherReading | null;
};

export const HOME_DOTS_TOP = 115;
const DIM = 153;
const FAINT = 85;
const CARD_TEXT_WIDTH = 278;

function icon(image: GrayImage, name: IconName, x: number, y: number, size = 24) {
  const rendered = renderIcon(name, size);
  if (rendered) image.drawImage(rendered, x, y);
}
function fitted(face: HomeFace, label: string, width: number): string {
  label = label.replace(/[\r\n\t]/g, " ");
  if (face.measureLine(label) <= width) return label;
  const chars = Array.from(label);
  while (chars.length && face.measureLine(chars.join("") + "…") > width) chars.pop();
  return chars.join("") + "…";
}
function wrapped(face: HomeFace, text: string, width: number, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of (text || "…").trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (face.measureLine(next) <= width) line = next;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.slice(0, max);
}

/** "ES ⇄ EN" with the arrows as pixel art: the stock font has no ⇄ glyph. */
function paintSwapArrow(panel: GrayImage, x: number, y: number, value: number) {
  panel.fillRect(x, y + 7, 18, 2, value);
  panel.fillRect(x + 2, y + 15, 18, 2, value);
  for (let step = 0; step < 3; step++) {
    panel.fillRect(x + 12 + step * 2, y + 3 + step * 2, 2, 2, value);
    panel.fillRect(x + 12 + step * 2, y + 11 - step * 2, 2, 2, value);
    panel.fillRect(x + 2 + step * 2, y + 15 + step * 2, 2, 2, value);
    panel.fillRect(x + 2 + step * 2, y + 15 - step * 2, 2, 2, value);
  }
}

export function paintHome(selected: number, data: HomeSnapshot, face: HomeFace): GrayImage {
  const image = new graphics.GrayImage(576, 288);
  const card = HOME_CARDS[selected];
  const panel = new graphics.GrayImage(318, 260);
  panel.drawRoundedRect(0, 0, 318, 260, 255, 6);
  const text = (x: number, y: number, label: string, value = 255, width = CARD_TEXT_WIDTH) =>
    face.drawText(panel, x, y, fitted(face, label, width), value);
  const centered = (y: number, label: string, value = 255) => {
    const line = fitted(face, label, CARD_TEXT_WIDTH);
    face.drawText(panel, Math.round((318 - face.measureLine(line)) / 2), y, line, value);
  };
  const header = () => {
    icon(panel, card.icon, 20, 18);
    text(52, 16, card.name, 255, 246);
  };
  const generic = (status: string) => {
    icon(panel, card.icon, 135, 54, 48);
    centered(120, card.name);
    if (status) centered(169, status, DIM);
  };
  // Translate and Converse: a big icon over two centred lines, no name (the lines say it).
  const glance = (white: () => void, dim: string) => {
    icon(panel, card.icon, 135, 70, 48);
    white();
    centered(185, dim, DIM);
  };
  if (card.id === "calendar" && data.calendar.events.length) {
    header();
    if (data.calendar.day) text(20, 62, data.calendar.day, DIM);
    data.calendar.events.forEach((event, i) => {
      const y = i === 0 ? (data.calendar.day ? 96 : 69) : 183;
      text(20, y, event.title || "Untitled");
      const time = event.allDay ? "All day" : `${clockTime(event.startMs)} - ${clockTime(event.endMs)}`;
      if (i === 0 && event.location) {
        text(20, y + 27, event.location, DIM);
        text(20, y + 54, time, DIM);
      } else text(20, y + 27, time, DIM);
    });
  } else if (card.id === "paseo" && glanceCounts(data.paseo)) {
    // Four counts in a 2×2 grid; the dot after Review means an agent is waiting on an answer.
    const counts = glanceCounts(data.paseo)!;
    header();
    if (counts.stale) face.drawText(panel, 298 - face.measureLine("Offline"), 16, "Offline", DIM);
    const cells: [string, number, boolean][] = [["Review", counts.review, counts.needsYou > 0], ["Working", counts.working, false],
      ["Background", counts.background, false], ["Done", counts.done, false]];
    cells.forEach(([label, n, needsYou], i) => {
      const cx = 20 + (i % 2) * 139 + 70, y = 66 + Math.floor(i / 2) * 96;
      paintDotNumber(panel, n, Math.round(cx - dotNumberWidth(n, 5) / 2), y, 5, n ? (counts.stale ? DIM : 255) : FAINT);
      const line = fitted(face, label, 139);
      const width = face.measureLine(line);
      face.drawText(panel, Math.round(cx - width / 2), y + 46, line, n ? DIM : FAINT);
      if (needsYou) panel.fillRoundedRect(Math.round(cx + width / 2) + 6, y + 46 + Math.round(face.lineHeight / 2) - 3, 6, 6, 255, 3);
    });
  } else if (card.id === "bots" && data.bots?.updates.length) {
    const pitch = Math.max(27, face.lineHeight + 4);
    const fits = (y: number) => y + face.lineHeight <= 254;
    header();
    let y = 62;
    for (const update of data.bots.updates) {
      if (!fits(y + pitch)) break;
      text(20, y, update.who, DIM);
      y += pitch;
      const lines = wrapped(face, update.line, CARD_TEXT_WIDTH, 3);
      if (lines.length > 2) { lines.length = 2; lines[1] = `${lines[1]}…`; }
      for (const line of lines) {
        if (!fits(y)) break;
        text(20, y, line);
        y += pitch;
      }
      y += 14;
    }
  } else if (card.id === "translate") {
    glance(() => {
      const left = "ES ", right = " EN";
      const x = Math.round((318 - face.measureLine(left) - 20 - face.measureLine(right)) / 2);
      face.drawText(panel, x, 136, left, 255);
      paintSwapArrow(panel, x + face.measureLine(left), 136, 255);
      face.drawText(panel, x + face.measureLine(left) + 20, 136, right, 255);
    }, data.translateReady ? "Ready" : "Setup required");
  } else if (card.id === "converse") {
    glance(() => centered(136, "Live facts · ES/EN"), emptyCardStatus(card.id));
  } else generic(card.id === "calendar" ? data.calendar.status ?? emptyCardStatus(card.id)
    : card.id === "paseo" ? glanceEmptyStatus(data.paseo)
    : card.id === "bots" ? data.bots?.status ?? emptyCardStatus(card.id) : emptyCardStatus(card.id));

  image.bitBlt(paintHomeColumn(homeColumnState(data.now, data.battery, data.weather, data.paseo, data.calendar), face), 0, 0);
  image.bitBlt(panel.withDrawsBaked(), 230, 14);
  for (let i = 0; i < HOME_CARDS.length; i++) image.fillRect(218, HOME_DOTS_TOP + i * 11, i === selected ? 4 : 2, 3, i === selected ? 255 : 85);
  return image.withDrawsBaked();
}
