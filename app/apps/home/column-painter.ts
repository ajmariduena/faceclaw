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
const DOT = 7;
const PITCH = 10;
const DIGIT_PITCH = 65;
const DIGIT_HEIGHT = 6 * PITCH + DOT;
const PAIR_GAP = 13;
export const CLOCK_LEFT = 50;
export const CLOCK_TOP = 70;
export const CLOCK_BOTTOM = CLOCK_TOP + 2 * DIGIT_HEIGHT + PAIR_GAP;

function digits(image: GrayImage, pair: string, y: number) {
  Array.from(pair).forEach((digit, i) => {
    const rows = DIGITS[Number(digit)];
    if (!rows) return;
    rows.forEach((row, dy) => Array.from(row).forEach((on, dx) => {
      if (on === "1") image.fillRoundedRect(CLOCK_LEFT + i * DIGIT_PITCH + dx * PITCH, y + dy * PITCH, DOT, DOT, 255, 3);
    }));
  });
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

export function paintHomeColumn(state: HomeColumn, face: HomeFace): GrayImage {
  const image = new GrayImage(COLUMN_WIDTH, 288);
  const iconDy = Math.round((face.lineHeight - ICON) / 2);
  const draw = (icon: GrayImage | null, x: number, y: number) => { if (icon) image.drawImage(icon, x, y); };
  const complication = (x: number, y: number, name: IconName, text: string, align: "left" | "right" = "left") => {
    const width = ICON + ICON_GAP + face.measureLine(text);
    const left = align === "left" ? x : x - width;
    draw(renderIcon(name, ICON), left, y + iconDy);
    face.drawText(image, left + ICON + ICON_GAP, y, text, 255);
  };
  complication(0, TOP_ROW, "calendar", state.day);
  for (const [x, name, level] of [[COLUMN_WIDTH - 98, "circle", state.battery.ring], [COLUMN_WIDTH - 44, "glasses", state.battery.glasses]] as const) {
    const icon = renderIcon(name, ICON);
    draw(level === null && icon ? icon.dimmed(DIM) : icon, x, TOP_ROW + iconDy);
    draw(gauge(level), x + ICON + 3, TOP_ROW + iconDy);
  }
  digits(image, state.hours, CLOCK_TOP);
  digits(image, state.minutes, CLOCK_TOP + DIGIT_HEIGHT + PAIR_GAP);
  if (state.weather) complication(0, BOTTOM_ROW, state.weather.icon, state.weather.label);
  if (state.needs > 0) complication(COLUMN_WIDTH, BOTTOM_ROW, "square-terminal", String(state.needs), "right");
  return image.withDrawsBaked();
}
