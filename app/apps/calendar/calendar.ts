import { GrayImage } from "../../graphics/image";
import { getCalendarReadState, readAgendaEvents, readEventAttendees, type CalendarEvent } from "../../native/calendar";
import { timeFormatSetting } from "../../ui/dashboard-settings";
import { type InputEvent } from "../../ui/gestures";
import { hasCalendarPermission } from "../../native/calendar-permissions";
import { type Layer, type LayerContext } from "../../ui/layers";
import type { Face } from "../paseo/paseo-painter";
import {
  agendaFooter,
  attendeesLine,
  buildAgenda,
  moveSelection,
  relativeWhen,
  reselect,
  startOfDay,
  timeRange,
  type AgendaRow,
} from "./calendar-agenda";
import { agendaScrollTop, paintAgenda, paintCalendarMessage, paintEventDetail } from "./calendar-painter";

const MAX_EVENTS = 50;
const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The Calendar app's agenda: today from midnight (ended events dimmer) and
 * the following days, ">" on one event; tap opens its detail. Without
 * calendar permission it says so (the launch path also fires the system
 * permission dialog, and a tap fires it again).
 */
export class CalendarLayer implements Layer {
  private selectedEvent: CalendarEvent | null = null;

  constructor(
    private readonly requestPermission: () => void,
    private readonly face: () => Face,
  ) {}

  private rows(nowMs: number): AgendaRow[] {
    const from = startOfDay(nowMs);
    return buildAgenda(readAgendaEvents(from, from + WINDOW_MS, MAX_EVENTS), nowMs, formatEventTime);
  }

  paint(ctx: LayerContext): GrayImage {
    const { width, height } = ctx.stack.getBaseSize();
    const image = new GrayImage(width, height, 0);
    const face = this.face();
    if (!hasCalendarPermission()) {
      paintCalendarMessage(image, face, "Calendar access needed", "Allow calendar access for Faceclaw on the phone.");
      return image;
    }
    const nowMs = Date.now();
    const rows = this.rows(nowMs);
    if (!rows.some((row) => row.kind === "event")) {
      const state = getCalendarReadState();
      if (state === "loading") {
        paintCalendarMessage(image, face, "Loading calendar…", "");
        return image;
      }
      if (state === "error") {
        paintCalendarMessage(image, face, "Calendar unavailable", "Try again shortly.");
        return image;
      }
    }
    const selected = reselect(rows, this.selectedEvent);
    const row = rows[selected];
    this.selectedEvent = row?.kind === "event" ? row.event : null;
    paintAgenda(image, face, { rows, selected, footerRight: agendaFooter(rows, selected, nowMs) }, agendaScrollTop(rows, selected));
    return image;
  }

  handleInput(event: InputEvent, ctx: LayerContext): void {
    if (!hasCalendarPermission()) {
      if (event.type === "click") this.requestPermission();
      return;
    }
    const rows = this.rows(Date.now());
    const selected = reselect(rows, this.selectedEvent);
    if (selected < 0) return;
    if (event.type === "scroll-up" || event.type === "scroll-down") {
      const row = rows[moveSelection(rows, selected, event.type === "scroll-down" ? 1 : -1)];
      if (row?.kind === "event") this.selectedEvent = row.event;
    } else if (event.type === "click") {
      const row = rows[selected];
      if (row?.kind === "event") ctx.stack.push(new CalendarEventLayer(row.event, this.face));
    }
  }
}

/** One event: title, time range and place, attendees, notes. Double tap goes back to the agenda. */
export class CalendarEventLayer implements Layer {
  private readonly attendees: string;

  constructor(
    private readonly event: CalendarEvent,
    private readonly face: () => Face,
  ) {
    this.attendees = attendeesLine(readEventAttendees(event.id));
  }

  paint(ctx: LayerContext): GrayImage {
    const { width, height } = ctx.stack.getBaseSize();
    const image = new GrayImage(width, height, 0);
    paintEventDetail(image, this.face(), {
      title: this.event.title,
      when: timeRange(this.event, formatEventTime),
      location: this.event.location,
      attendees: this.attendees,
      notes: plainNotes(this.event.notes ?? ""),
      footerRight: relativeWhen(this.event, Date.now()),
    });
    return image;
  }

  handleInput(event: InputEvent, ctx: LayerContext): void {
    if (event.type === "double-click") ctx.stack.pop();
  }
}

/** Calendar descriptions are often HTML (Google Calendar) with long separator rules. */
export function plainNotes(notes: string): string {
  return notes
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[-_=~:*]{6,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dayHeaderLabel(timestampMs: number): string {
  const date = new Date(timestampMs);
  const now = new Date();
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDelta = Math.round((midnight(date) - midnight(now)) / (24 * 60 * 60 * 1000));
  const base = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  if (dayDelta === 0) return `Today  ${base}`;
  if (dayDelta === 1) return `Tomorrow  ${base}`;
  return base;
}

export function formatEventTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const hour24 = date.getHours();
  if (timeFormatSetting.get() === "12h") {
    const hour12 = ((hour24 + 11) % 12) + 1;
    return `${hour12}:${minutes} ${hour24 < 12 ? "AM" : "PM"}`;
  }
  return `${String(hour24).padStart(2, "0")}:${minutes}`;
}
