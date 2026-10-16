import * as graphics from "../../graphics/image";
import type { GrayImage } from "../../graphics/image";
import { HOME_CARDS, homeColumnState, emptyCardStatus, clockTime, type HomeBattery, type HomeCalendar } from "./home-model";
import { renderIcon, type IconName } from "../../graphics/icons";
import { dotNumberWidth, paintDotNumber, paintHomeColumn } from "./column-painter";
import type { HomeWeatherReading } from "./home-weather";
import { glanceCounts, glanceEmptyStatus, type PaseoGlanceSnapshot } from "../paseo/paseo-glance";
import type { BotsGlance } from "../bots/bots-model";
import { BOT_MARK_WIDTH, botMark } from "../bots/bot-mark";
import type { InstantGlance } from "../instant/instant-glance";

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
  /** Instant's last answer and its age, or why it cannot start. */
  instant?: InstantGlance | null;
  /** A Soniox key is stored, so Translate can start. */
  translateReady?: boolean;
  /** Every key Converse needs is stored (missingConverseKey), so it can start. */
  converseReady?: boolean;
  /** Ring and glasses levels from the shell; null (or absent) while unknown. */
  battery?: HomeBattery;
  /** The last Open-Meteo reading; null (or absent) hides the complication. */
  weather?: HomeWeatherReading | null;
};

export const HOME_DOTS_TOP = Math.round(144 - ((HOME_CARDS.length - 1) * 11 + 3) / 2);
const DIM = 153;
const FAINT = 85;
const CARD_TEXT_WIDTH = 278;
const BOT_LINE_WIDTH = 270;

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
  } else if (card.id === "bots") {
    // The bot's own mark, its face following its state, over its last reply.
    const bots = data.bots;
    panel.bitBlt(botMark(bots?.face ?? "idle"), Math.round((318 - BOT_MARK_WIDTH) / 2), 14);
    if (bots?.line) {
      const pitch = Math.max(27, face.lineHeight + 4);
      const lines = wrapped(face, bots.line, BOT_LINE_WIDTH, 4);
      if (lines.length > 3) { lines.length = 3; lines[2] = fitted(face, `${lines[2]}…`, BOT_LINE_WIDTH); }
      const top = 124 + Math.round((3 - lines.length) * pitch / 2);
      lines.forEach((line, i) => centered(top + i * pitch, line, bots.lineDim ? DIM : 255));
      centered(222, bots.age, DIM);
    } else centered(150, bots?.status ?? emptyCardStatus(card.id), DIM);
  } else if (card.id === "instant") {
    // A bolt over the last answer, like Grok Bot's card.
    const instant = data.instant;
    icon(panel, "zap", Math.round((318 - 48) / 2), 24, 48);
    if (instant?.line) {
      const pitch = Math.max(27, face.lineHeight + 4);
      const lines = wrapped(face, instant.line, BOT_LINE_WIDTH, 4);
      if (lines.length > 3) { lines.length = 3; lines[2] = fitted(face, `${lines[2]}…`, BOT_LINE_WIDTH); }
      const top = 124 + Math.round((3 - lines.length) * pitch / 2);
      lines.forEach((line, i) => centered(top + i * pitch, line, 255));
      centered(222, instant.age, DIM);
    } else centered(150, instant?.status ?? emptyCardStatus(card.id), DIM);
  } else if (card.id === "translate") {
    glance(() => {
      const left = "ES ", right = " EN";
      const x = Math.round((318 - face.measureLine(left) - 20 - face.measureLine(right)) / 2);
      face.drawText(panel, x, 136, left, 255);
      paintSwapArrow(panel, x + face.measureLine(left), 136, 255);
      face.drawText(panel, x + face.measureLine(left) + 20, 136, right, 255);
    }, data.translateReady ? "Ready" : "Setup required");
  } else if (card.id === "converse") {
    glance(() => centered(136, "Live facts · ES/EN"), data.converseReady ? "Ready" : "Setup required");
  } else generic(card.id === "calendar" ? data.calendar.status ?? emptyCardStatus(card.id)
    : card.id === "paseo" ? glanceEmptyStatus(data.paseo) : emptyCardStatus(card.id));

  image.bitBlt(paintHomeColumn(homeColumnState(data.now, data.battery, data.weather, data.paseo, data.calendar), face), 0, 0);
  image.bitBlt(panel.withDrawsBaked(), 230, 14);
  for (let i = 0; i < HOME_CARDS.length; i++) image.fillRect(218, HOME_DOTS_TOP + i * 11, i === selected ? 4 : 2, 3, i === selected ? 255 : 85);
  return image.withDrawsBaked();
}
