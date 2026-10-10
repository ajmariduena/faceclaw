import * as graphics from "../../graphics/image";
import type { GrayImage } from "../../graphics/image";
import { HOME_CARDS, homeColumnState, emptyCardStatus, clockTime, type HomeBattery, type HomeCalendar } from "./home-model";
import { renderIcon, type IconName } from "../../graphics/icons";
import { paintHomeColumn } from "./column-painter";
import type { HomeWeatherReading } from "./home-weather";
import { glanceEmptyStatus, glanceVerdict, type PaseoGlanceSnapshot } from "../paseo/paseo-glance";

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
  /** A Soniox key is stored, so Translate can start. */
  translateReady?: boolean;
  /** Ring and glasses levels from the shell; null (or absent) while unknown. */
  battery?: HomeBattery;
  /** The last Open-Meteo reading; null (or absent) hides the complication. */
  weather?: HomeWeatherReading | null;
};

export const HOME_DOTS_TOP = 120;
const DIM = 153;
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
  } else if (card.id === "paseo" && glanceVerdict(data.paseo, data.now.getTime())) {
    // Verdict, the agent behind it (title dim, line white), and the ledger pinned to the last row.
    const paseo = glanceVerdict(data.paseo, data.now.getTime())!;
    const pitch = Math.max(27, face.lineHeight + 4);
    const rows: number[] = [];
    for (let y = 62; y + face.lineHeight <= 254; y += pitch) rows.push(y);
    header();
    text(20, rows[0]!, paseo.verdict);
    if (paseo.lead) {
      text(20, rows[1]!, paseo.lead.title, DIM);
      const max = Math.min(2, rows.length - 3);
      const lines = wrapped(face, paseo.lead.line, CARD_TEXT_WIDTH, max + 1);
      if (lines.length > max) { lines.length = max; lines[max - 1] = `${lines[max - 1]}…`; }
      lines.forEach((line, i) => text(20, rows[2 + i]!, line));
    } else if (paseo.note) text(20, rows[1]!, paseo.note, DIM);
    if (paseo.ledger) text(20, rows[rows.length - 1]!, paseo.ledger, DIM);
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
    : card.id === "paseo" ? glanceEmptyStatus(data.paseo) : emptyCardStatus(card.id));

  image.bitBlt(paintHomeColumn(homeColumnState(data.now, data.battery, data.weather, data.paseo), face), 0, 0);
  image.bitBlt(panel.withDrawsBaked(), 230, 14);
  for (let i = 0; i < HOME_CARDS.length; i++) image.fillRect(218, HOME_DOTS_TOP + i * 11, i === selected ? 4 : 2, 3, i === selected ? 255 : 85);
  return image.withDrawsBaked();
}
