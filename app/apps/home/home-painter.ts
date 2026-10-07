import * as graphics from "../../graphics/image";
import type { GrayImage } from "../../graphics/image";
import { HOME_CARDS, HOME_WEEKDAYS, horizonteClockState, emptyCardStatus, type HomeCalendar } from "./home-model";
import * as art from "./stock-art";
import { paintHorizonte } from "./horizonte-painter";

export type HomeFace = {
  readonly lineHeight: number;
  measureLine(text: string): number;
  drawText(image: GrayImage, x: number, y: number, text: string, value?: number): void;
};
export type HomeSnapshot = {
  now: Date;
  calendar: HomeCalendar;
  music: { title: string; artist: string; playing: boolean } | null;
  notifications: readonly { title: string; text: string; appName: string }[];
};

const icons = new Map<string, GrayImage>();
function icon(image: GrayImage, name: keyof typeof art.patterns, x: number, y: number, size = 24) {
  const key = `${name}:${size}`;
  if (!icons.has(key)) icons.set(key, art.icon(graphics, name, size));
  image.drawImage(icons.get(key)!, x, y);
}
function fitted(face: HomeFace, label: string, width: number): string {
  label = label.replace(/[\r\n\t]/g, " ");
  if (face.measureLine(label) <= width) return label;
  const chars = Array.from(label);
  while (chars.length && face.measureLine(chars.join("") + "…") > width) chars.pop();
  return chars.join("") + "…";
}

export function paintHome(selected: number, data: HomeSnapshot, face: HomeFace, clockFace: HomeFace): GrayImage {
  const image = new graphics.GrayImage(576, 288);
  const card = HOME_CARDS[selected];
  const panel = new graphics.GrayImage(318, 260);
  panel.drawRoundedRect(0, 0, 318, 260, 255, 6);
  const text = (x: number, y: number, label: string, value = 255, width = 278) =>
    face.drawText(panel, x, y, fitted(face, label, width), value);
  const centered = (y: number, label: string, value = 255) => {
    const line = fitted(face, label, 278);
    face.drawText(panel, Math.round((318 - face.measureLine(line)) / 2), y, line, value);
  };
  const header = () => {
    icon(panel, card.icon, 20, 18);
    text(52, 16, card.name, 255, 246);
  };
  const generic = (status: string) => {
    icon(panel, card.icon, 135, 54, 48);
    centered(120, card.name);
    centered(169, status, 153);
  };
  if (card.id === "calendar" && data.calendar.events.length) {
    header();
    data.calendar.events.forEach((event, i) => {
      const y = i === 0 ? 69 : 183;
      text(20, y, event.title || "Sin título");
      const hhmm = (ms: number) => {
        const date = new Date(ms);
        return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      };
      const time = event.allDay ? "Todo el día" : `Hoy ${hhmm(event.startMs)} - ${hhmm(event.endMs)}`;
      if (i === 0 && event.location) {
        text(20, y + 27, event.location, 153);
        text(20, y + 54, time, 153);
      } else text(20, y + 27, time, 153);
    });
  } else if (card.id === "calendar" && data.calendar.nextEvent) {
    const next = data.calendar.nextEvent;
    const date = new Date(next.startMs);
    header();
    text(20, 65, "Sin eventos hoy", 153);
    text(20, 106, `Próximo: ${HOME_WEEKDAYS[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`, 153);
    const words = (next.title || "Sin título").trim().split(/\s+/);
    let first = words.shift()!;
    while (words.length && face.measureLine(`${first} ${words[0]}`) <= 278) first += ` ${words.shift()}`;
    text(20, 139, first);
    if (words.length) text(20, 166, words.join(" "));
    text(20, 210, next.allDay ? "Todo el día"
      : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`, 153);
  } else if (card.id === "music" && data.music) {
    header();
    text(20, 69, data.music.title || "Sin título");
    text(20, 96, data.music.artist, 153);
    text(20, 139, data.music.playing ? "Sonando" : "En pausa", 153);
  } else if (card.id === "notifications" && data.notifications.length) {
    header();
    data.notifications.slice(0, 2).forEach((item, i) => {
      const y = i === 0 ? 69 : 183;
      text(20, y, item.title || item.appName);
      text(20, y + 27, item.text || item.appName, 153);
    });
  } else if (card.id === "translate") {
    generic("");
    const left = "ES ", right = " EN · Toca para empezar";
    const width = face.measureLine(left) + 20 + face.measureLine(right);
    const y = width <= 278 ? 169 : 157;
    const suffix = width <= 278 ? right : " EN";
    const x = Math.round((318 - face.measureLine(left) - 20 - face.measureLine(suffix)) / 2);
    face.drawText(panel, x, y, left, 153);
    const arrowX = x + face.measureLine(left);
    panel.fillRect(arrowX, y + 7, 18, 2, 153);
    panel.fillRect(arrowX + 2, y + 15, 18, 2, 153);
    for (let step = 0; step < 3; step++) {
      panel.fillRect(arrowX + 12 + step * 2, y + 3 + step * 2, 2, 2, 153);
      panel.fillRect(arrowX + 12 + step * 2, y + 11 - step * 2, 2, 2, 153);
      panel.fillRect(arrowX + 2 + step * 2, y + 15 + step * 2, 2, 2, 153);
      panel.fillRect(arrowX + 2 + step * 2, y + 15 - step * 2, 2, 2, 153);
    }
    face.drawText(panel, arrowX + 20, y, suffix, 153);
    if (width > 278) centered(196, emptyCardStatus(card.id), 153);
  } else generic(card.id === "calendar" ? data.calendar.status ?? emptyCardStatus(card.id) : emptyCardStatus(card.id));

  image.bitBlt(paintHorizonte(horizonteClockState(data.calendar, data.now), face, clockFace), 0, 0);
  image.bitBlt(panel.withDrawsBaked(), 230, 14);
  for (let i = 0; i < HOME_CARDS.length; i++) image.fillRect(218, 120 + i * 11, i === selected ? 4 : 2, 3, i === selected ? 255 : 85);
  return image.withDrawsBaked();
}
