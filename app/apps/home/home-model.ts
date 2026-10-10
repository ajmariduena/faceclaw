import type { CalendarEvent, CalendarReadState } from "../../native/calendar-types";

export const HOME_WINDOW_ID = "home";
export const HOME_SURFACE_ID = "window:home";
export const HOME_CARDS = [
  { id: "paseo", name: "Paseo", icon: "ai", appId: "paseo" },
  { id: "calendar", name: "Calendar", icon: "calendar", appId: "calendar" },
  { id: "translate", name: "Translate", icon: "translate", appId: "translate" },
  { id: "converse", name: "Converse", icon: "people", appId: "converse" },
  { id: "more", name: "More", icon: "more", appId: "launcher" },
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

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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
  /** What Horizonte shows: the next event, today or later. */
  next: CalendarEvent | null;
  /** What the card shows: the events after `next` on the soonest day that has any. */
  events: CalendarEvent[];
  /** The card events' day when it is not today. */
  day: string | null;
  /** Card text when there are no card events. */
  status: string | null;
};
export function calendarCardState(
  permitted: boolean, events: readonly CalendarEvent[], nowMs: number, readState: CalendarReadState = "ready",
): HomeCalendar {
  if (!permitted) return { next: null, events: [], day: null, status: "No calendar access" };
  const upcoming = events.filter(event => event.endMs > nowMs).sort((a, b) => a.startMs - b.startMs);
  const next = upcoming[0] ?? null;
  const rest = upcoming.slice(1);
  if (rest.length) {
    const day = startOfDay(rest[0].startMs);
    const dayEnd = startOfDay(rest[0].startMs, 1);
    return { next, events: rest.filter(event => event.startMs < dayEnd).slice(0, 2),
      day: day === startOfDay(nowMs) ? null : dayLabel(day, nowMs), status: null };
  }
  const status = readState === "loading" ? "Loading calendar…" : readState === "error" ? "Calendar unavailable"
    : !next ? "Nothing today" : next.startMs < startOfDay(nowMs, 1) ? "Nothing else today" : "Nothing else";
  return { next, events: [], day: null, status };
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

export type HorizonteClock = {
  time: string;
  date: string;
  eventLine: string | null;
  nextLine: string | null;
  title: string | null;
};

export function horizonteClockState(calendar: HomeCalendar, now: Date): HorizonteClock {
  const state: HorizonteClock = {
    time: clockTime(now),
    date: `${WEEKDAY_NAMES[now.getDay()]}, ${MONTH_NAMES[now.getMonth()]} ${now.getDate()}`,
    eventLine: calendar.status === "Nothing today" ? "Nothing today" : null,
    nextLine: null,
    title: null,
  };
  const event = calendar.next;
  if (!event || event.endMs <= now.getTime()) return state;
  state.title = (event.title || "Untitled").replace(/[\r\n\t]/g, " ");
  if (event.startMs < startOfDay(now.getTime(), 1)) {
    const minutes = Math.ceil((event.startMs - now.getTime()) / 60_000);
    const status = minutes <= 0 ? "Now" : minutes < 60 ? `in ${minutes} min` : `in ${Math.round(minutes / 60)} h`;
    state.eventLine = `${event.allDay ? "All day" : clockTime(event.startMs)} · ${status}`;
  } else {
    state.eventLine = "Nothing today";
    state.nextLine = `${dayLabel(startOfDay(event.startMs), now.getTime())} ${event.allDay ? "· All day" : clockTime(event.startMs)}`;
  }
  return state;
}
