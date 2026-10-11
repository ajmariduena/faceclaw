import { GrayImage } from "../../graphics/image";
import { renderIcon, type IconName } from "../../graphics/icons";
import type { HomeFace } from "./home-painter";
import type { HomeColumn } from "./home-model";

/** The app keeps its dots at x=218 and card at x=230; the column owns everything left of them. */
export const COLUMN_WIDTH = 212;
const ICON = 20;
const ICON_GAP = 5;
const TOP_ROW = 12;
const BOTTOM_ROW = 248;
const DIM = 0.4;
const DETAIL_GAP = 8;

// Original 5x7 numerals: open counters, a diagonal 2/7, equal pitch.
const DIGITS = [
  ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
];
const DOT = 6;
const PITCH = 8;
const DIGIT_WIDTH = 4 * PITCH + DOT;
const DIGIT_HEIGHT = 6 * PITCH + DOT;
const DIGIT_PITCH = DIGIT_WIDTH + 8;
const COLON = 6;
const COLON_GAP = 10;
const CLOCK_WIDTH = 2 * (DIGIT_PITCH + DIGIT_WIDTH) + 2 * COLON_GAP + COLON;
const BAR_GAP = 14;
const BAR_HEIGHT = 2;
const LINE_GAP = 14;
export const CLOCK_LEFT = Math.round((COLUMN_WIDTH - CLOCK_WIDTH) / 2);
export const CLOCK_TOP = 93;
/** Bottom of the clock block including its bar; the next-event line starts LINE_GAP below. */
export const CLOCK_BOTTOM = CLOCK_TOP + DIGIT_HEIGHT + BAR_GAP + BAR_HEIGHT;
const DIM_VALUE = 153;
const BAR_TRACK = 17;
const BAR_FILL = 85;

function digits(image: GrayImage, pair: string, left: number) {
  Array.from(pair).forEach((digit, i) => {
    const rows = DIGITS[Number(digit)];
    if (!rows) return;
    rows.forEach((row, dy) => Array.from(row).forEach((on, dx) => {
      if (on === "1") image.fillRoundedRect(left + i * DIGIT_PITCH + dx * PITCH, CLOCK_TOP + dy * PITCH, DOT, DOT, 255, 3);
    }));
  });
}

/** HH:MM on one row with a dim two-dot colon, like a station board. */
function clock(image: GrayImage, hours: string, minutes: string) {
  digits(image, hours, CLOCK_LEFT);
  const colon = CLOCK_LEFT + DIGIT_PITCH + DIGIT_WIDTH + COLON_GAP;
  image.fillRoundedRect(colon, CLOCK_TOP + 2 * PITCH, COLON, COLON, DIM_VALUE, 3);
  image.fillRoundedRect(colon, CLOCK_TOP + 4 * PITCH, COLON, COLON, DIM_VALUE, 3);
  digits(image, minutes, colon + COLON + COLON_GAP);
}

/** The Lucide battery outline with its body filled to the level; dim and empty while unknown. */
function gauge(level: number | null): GrayImage | null {
  const outline = renderIcon("battery", ICON);
  if (!outline) return null;
  if (level === null) return outline.dimmed(DIM);
  const filled = outline.clone();
  const inner = Math.round(9 * Math.max(0, Math.min(100, level)) / 100);
  if (inner) filled.fillRect(4, 8, inner, 5, 255);
  return filled;
}

// Same as home-painter's fitted(); a value import from there would be circular.
function fit(face: HomeFace, label: string, width: number): string {
  label = label.replace(/[\r\n\t]/g, " ");
  if (face.measureLine(label) <= width) return label;
  const chars = Array.from(label);
  while (chars.length && face.measureLine(chars.join("").trimEnd() + "…") > width) chars.pop();
  return chars.join("").trimEnd() + "…";
}

export function paintHomeColumn(state: HomeColumn, face: HomeFace): GrayImage {
  const image = new GrayImage(COLUMN_WIDTH, 288);
  const iconDy = Math.round((face.lineHeight - ICON) / 2);
  const draw = (icon: GrayImage | null, x: number, y: number) => { if (icon) image.drawImage(icon, x, y); };
  const complication = (x: number, y: number, name: IconName, text: string, align: "left" | "right" = "left", detail?: string) => {
    const detailWidth = detail ? DETAIL_GAP + face.measureLine(detail) : 0;
    const width = ICON + ICON_GAP + face.measureLine(text) + detailWidth;
    const left = align === "left" ? x : x - width;
    draw(renderIcon(name, ICON), left, y + iconDy);
    face.drawText(image, left + ICON + ICON_GAP, y, text, 255);
    if (detail) face.drawText(image, left + width - detailWidth + DETAIL_GAP, y, detail, DIM_VALUE);
  };
  complication(0, TOP_ROW, "calendar", state.day);
  for (const [x, name, level] of [[COLUMN_WIDTH - 98, "circle", state.battery.ring], [COLUMN_WIDTH - 44, "glasses", state.battery.glasses]] as const) {
    const icon = renderIcon(name, ICON);
    draw(level === null && icon ? icon.dimmed(DIM) : icon, x, TOP_ROW + iconDy);
    draw(gauge(level), x + ICON + 3, TOP_ROW + iconDy);
  }
  clock(image, state.hours, state.minutes);
  if (state.next) {
    const barY = CLOCK_TOP + DIGIT_HEIGHT + BAR_GAP;
    image.fillRect(CLOCK_LEFT, barY, CLOCK_WIDTH, BAR_HEIGHT, BAR_TRACK);
    const filled = Math.round(CLOCK_WIDTH * state.next.progress);
    if (filled) image.fillRect(CLOCK_LEFT, barY, filled, BAR_HEIGHT, BAR_FILL);
    const y = CLOCK_BOTTOM + LINE_GAP;
    const timeWidth = face.measureLine(state.next.time);
    face.drawText(image, CLOCK_LEFT, y, state.next.time, 255);
    const titleLeft = CLOCK_LEFT + timeWidth + DETAIL_GAP;
    face.drawText(image, titleLeft, y, fit(face, state.next.title, CLOCK_LEFT + CLOCK_WIDTH - titleLeft), DIM_VALUE);
  }
  if (state.weather) complication(0, BOTTOM_ROW, state.weather.icon, state.weather.label, "left", state.weather.detail);
  if (state.needs > 0) complication(COLUMN_WIDTH, BOTTOM_ROW, "square-terminal", String(state.needs), "right");
  return image.withDrawsBaked();
}
