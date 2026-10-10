import type { CalendarEvent } from "../../native/calendar-types";

/**
 * The Calendar app's agenda as rows: a dim heading per day from today through
 * the last day with events, the day's events (all-day first), and "Nothing
 * scheduled" for a day without any. Pure, so the painter, the app and the
 * tests share it.
 */
export type AgendaRow =
  | { kind: "heading"; label: string; dayStartMs: number }
  | { kind: "empty"; dayStartMs: number }
  | { kind: "event"; event: CalendarEvent; time: string; past: boolean; now: boolean; dayStartMs: number };

export type TimeFormatter = (timestampMs: number) => string;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_DAYS = 14;

export const NOTHING_SCHEDULED = "Nothing scheduled";
export const ALL_DAY = "All day";

export function startOfDay(timestampMs: number): number {
  const date = new Date(timestampMs);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function nextDay(dayStartMs: number): number {
  const date = new Date(dayStartMs);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

/** Whole local days from `fromDayMs` to `toDayMs` (both day starts). */
function dayDelta(fromDayMs: number, toDayMs: number): number {
  return Math.round((toDayMs - fromDayMs) / (24 * 60 * 60 * 1000));
}

/** "Friday, Oct 9" */
export function dayLabel(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Today · Friday, Oct 9", "Tomorrow · Saturday, Oct 10", "Sunday, Oct 11". */
export function agendaHeading(dayStartMs: number, nowMs: number): string {
  const delta = dayDelta(startOfDay(nowMs), dayStartMs);
  if (delta === 0) return `Today · ${dayLabel(dayStartMs)}`;
  if (delta === 1) return `Tomorrow · ${dayLabel(dayStartMs)}`;
  return dayLabel(dayStartMs);
}

function belongsToDay(event: CalendarEvent, dayStartMs: number, dayEndMs: number, todayStartMs: number, nowMs: number): boolean {
  if (event.allDay) return event.startMs < dayEndMs && event.endMs > dayStartMs;
  if (event.startMs >= dayStartMs && event.startMs < dayEndMs) return true;
  // A timed event carried over from an earlier day shows today while it lasts.
  return dayStartMs === todayStartMs && event.startMs < dayStartMs && event.endMs > nowMs;
}

export function buildAgenda(events: readonly CalendarEvent[], nowMs: number, formatTime: TimeFormatter): AgendaRow[] {
  const todayStart = startOfDay(nowMs);
  let lastDay = todayStart;
  for (const event of events) {
    const day = startOfDay(event.allDay ? Math.max(event.startMs, todayStart) : event.startMs);
    if (day > lastDay) lastDay = day;
  }
  const rows: AgendaRow[] = [];
  for (let day = todayStart, count = 0; day <= lastDay && count < MAX_DAYS; day = nextDay(day), count++) {
    const end = nextDay(day);
    rows.push({ kind: "heading", label: agendaHeading(day, nowMs), dayStartMs: day });
    const dayEvents = events
      .filter((event) => belongsToDay(event, day, end, todayStart, nowMs))
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMs - b.startMs);
    if (!dayEvents.length) rows.push({ kind: "empty", dayStartMs: day });
    for (const event of dayEvents) {
      rows.push({
        kind: "event",
        event,
        time: event.allDay ? ALL_DAY : formatTime(event.startMs),
        past: event.endMs <= nowMs,
        now: !event.allDay && event.startMs <= nowMs && event.endMs > nowMs,
        dayStartMs: day,
      });
    }
  }
  return rows;
}

/** Row index the agenda opens on: the first timed event that hasn't ended, else any that hasn't, else the last one; -1 without events. */
export function initialSelection(rows: readonly AgendaRow[]): number {
  let firstOpen = -1;
  let last = -1;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    if (row.kind !== "event") continue;
    last = index;
    if (row.past) continue;
    if (!row.event.allDay) return index;
    if (firstOpen < 0) firstOpen = index;
  }
  return firstOpen >= 0 ? firstOpen : last;
}

/** The event row `step` events away from `selected`, stopping at the ends. */
export function moveSelection(rows: readonly AgendaRow[], selected: number, step: 1 | -1): number {
  for (let index = selected + step; index >= 0 && index < rows.length; index += step) {
    if (rows[index]!.kind === "event") return index;
  }
  return selected;
}

/** Keep a selected event when the rows are rebuilt (refresh, clock tick). */
export function reselect(rows: readonly AgendaRow[], previous: CalendarEvent | null): number {
  if (previous) {
    const index = rows.findIndex((row) => row.kind === "event" && row.event.id === previous.id && row.event.startMs === previous.startMs);
    if (index >= 0) return index;
  }
  return initialSelection(rows);
}

/** Footer counts for the day of the selection: "1 now · 4 today", "2 tomorrow", "3 on Monday". */
export function agendaFooter(rows: readonly AgendaRow[], selected: number, nowMs: number): string {
  const todayStart = startOfDay(nowMs);
  const day = rows[selected]?.dayStartMs ?? todayStart;
  const dayEvents = rows.filter((row): row is Extract<AgendaRow, { kind: "event" }> => row.kind === "event" && row.dayStartMs === day);
  const delta = dayDelta(todayStart, day);
  if (delta === 0) {
    const now = dayEvents.filter((row) => row.now).length;
    return now ? `${now} now · ${dayEvents.length} today` : `${dayEvents.length} today`;
  }
  if (delta === 1) return `${dayEvents.length} tomorrow`;
  return `${dayEvents.length} on ${WEEKDAYS[new Date(day).getDay()]}`;
}

/** "in 25 min", "in 1 h 55 min", "Now", "Ended", or the day for later days. */
export function relativeWhen(event: CalendarEvent, nowMs: number): string {
  if (event.endMs <= nowMs) return "Ended";
  if (event.startMs <= nowMs) return "Now";
  const minutes = Math.ceil((event.startMs - nowMs) / 60_000);
  if (startOfDay(event.startMs) !== startOfDay(nowMs) && minutes >= 6 * 60) {
    return dayDelta(startOfDay(nowMs), startOfDay(event.startMs)) === 1 ? "Tomorrow" : dayLabel(event.startMs);
  }
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `in ${hours} h ${rest} min` : `in ${hours} h`;
}

/** "11:00 – 12:00", "All day", or with the dates when it spans days. */
export function timeRange(event: CalendarEvent, formatTime: TimeFormatter): string {
  if (event.allDay) {
    const lastDay = startOfDay(Math.max(event.startMs, event.endMs - 1));
    return lastDay === startOfDay(event.startMs) ? ALL_DAY : `${ALL_DAY} · ${shortDay(event.startMs)} – ${shortDay(lastDay)}`;
  }
  if (startOfDay(event.startMs) === startOfDay(event.endMs) || event.endMs <= event.startMs) {
    return `${formatTime(event.startMs)} – ${formatTime(Math.max(event.startMs, event.endMs))}`;
  }
  return `${shortDay(event.startMs)} ${formatTime(event.startMs)} – ${shortDay(event.endMs)} ${formatTime(event.endMs)}`;
}

function shortDay(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "With Ricardo", "With Ricardo and Nessa", "With Ricardo, Hayleen and Nessa". */
export function attendeesLine(names: readonly string[]): string {
  if (!names.length) return "";
  if (names.length === 1) return `With ${names[0]}`;
  return `With ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
