import type { CalendarEvent, CalendarReadState } from "../../native/calendar-types";
import type { IconName } from "../../graphics/icons";
import type { PaseoGlanceSnapshot } from "../paseo/paseo-glance";
import { weatherIcon, weatherLabel, type HomeWeatherReading } from "./home-weather";

export const HOME_WINDOW_ID = "home";
export const HOME_SURFACE_ID = "window:home";
export const HOME_CARDS = [
  { id: "paseo", name: "Paseo", icon: "square-terminal", appId: "paseo" },
  { id: "calendar", name: "Calendar", icon: "calendar-days", appId: "calendar" },
  { id: "translate", name: "Translate", icon: "languages", appId: "translate" },
  { id: "converse", name: "Converse", icon: "messages-square", appId: "converse" },
  { id: "more", name: "More", icon: "layout-grid", appId: "launcher" },
] as const;
export type HomeCardId = typeof HOME_CARDS[number]["id"];

/** Double taps this soon after arriving home are the tail of a back-out, not a request to sleep. */
export const HOME_SLEEP_GUARD_MS = 700;

export class HomeModel {
  private index = 0;
  view: "home" | "app" = "home";
  get selected() { return HOME_CARDS[this.index]; }
  get selectedIndex(): number { return this.index; }
  move(direction: -1 | 1): void {
    this.index = (this.index + direction + HOME_CARDS.length) % HOME_CARDS.length;
  }
  open(): string {
    this.view = "app";
    return this.selected.appId;
  }
  returnHome(): void { this.view = "home"; }
  wake(): void { this.index = 0; this.returnHome(); }
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const clockTime = (date: Date | number) => {
  const d = typeof date === "number" ? new Date(date) : date;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const startOfDay = (ms: number, daysAhead = 0) => {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + daysAhead).getTime();
};

/** "Tomorrow", else "Mon, Oct 13". */
export function dayLabel(dayMs: number, nowMs: number): string {
  if (dayMs < startOfDay(nowMs, 2)) return "Tomorrow";
  const date = new Date(dayMs);
  return `${WEEKDAY_SHORT[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

export type HomeCalendar = {
  /** What the card shows: the next events, on the soonest day that has any. */
  events: CalendarEvent[];
  /** The card events' day when it is not today. */
  day: string | null;
  /** Card text when there are no card events. */
  status: string | null;
};
export function calendarCardState(
  permitted: boolean, events: readonly CalendarEvent[], nowMs: number, readState: CalendarReadState = "ready",
): HomeCalendar {
  if (!permitted) return { events: [], day: null, status: "No calendar access" };
  const upcoming = events.filter(event => event.endMs > nowMs).sort((a, b) => a.startMs - b.startMs);
  if (upcoming.length) {
    // An event that started before today (multi-day, ongoing) counts as today's.
    const day = Math.max(startOfDay(upcoming[0].startMs), startOfDay(nowMs));
    const dayEnd = startOfDay(day, 1);
    return { events: upcoming.filter(event => event.startMs < dayEnd).slice(0, 2),
      day: day === startOfDay(nowMs) ? null : dayLabel(day, nowMs), status: null };
  }
  const status = readState === "loading" ? "Loading calendar…" : readState === "error" ? "Calendar unavailable" : "Nothing today";
  return { events: [], day: null, status };
}

export function emptyCardStatus(card: HomeCardId): string {
  switch (card) {
    case "calendar": return "Nothing today";
    case "paseo": return "No updates";
    case "translate": return "Ready";
    case "converse": return "Coming soon";
    case "more": return "";
  }
}

export type HomeBattery = { ring: number | null; glasses: number | null };

/** The left column: a big dot-matrix clock between two rows of complications. */
export type HomeColumn = {
  hours: string;
  minutes: string;
  /** "Sat 10" */
  day: string;
  battery: HomeBattery;
  /** null hides the complication (no reading yet, or a stale one). */
  weather: { icon: IconName; label: string } | null;
  /** Paseo agents waiting on the user; 0 (or no pairing) hides the complication. */
  needs: number;
};

export function homeColumnState(
  now: Date, battery: HomeBattery | undefined, weather: HomeWeatherReading | null | undefined,
  paseo: PaseoGlanceSnapshot | null | undefined,
): HomeColumn {
  return {
    hours: String(now.getHours()).padStart(2, "0"),
    minutes: String(now.getMinutes()).padStart(2, "0"),
    day: `${WEEKDAY_SHORT[now.getDay()]} ${now.getDate()}`,
    battery: battery ?? { ring: null, glasses: null },
    weather: weather ? { icon: weatherIcon(weather.code, weather.isDay), label: weatherLabel(weather) } : null,
    needs: paseo?.configured ? paseo.needs : 0,
  };
}
