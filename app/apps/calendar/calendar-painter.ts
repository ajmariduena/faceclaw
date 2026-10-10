/**
 * Calendar screens in the terminal-mode frame (approved render:
 * tools/headless-render/calendar-terminal.cjs, with English chrome): the
 * agenda with dim day headings, a time column and ">" on the selection, and
 * one event's detail. Pure painters over a Face, like the Paseo painter.
 */
import type { GrayImage } from "../../graphics/image";
import {
  CONTENT_BOTTOM,
  CONTENT_TOP,
  FOOTER_TOP,
  LEFT,
  PITCH,
  RIGHT,
  fitLine,
  paintFooter,
  paintFrame,
  wrapCapped,
  type Face,
} from "../paseo/paseo-painter";
import { NOTHING_SCHEDULED, type AgendaRow } from "./calendar-agenda";

const HEADING = 119;
const DIM = 120;
const TIME = 136;
const TITLE = 204;
const PAST_TIME = 85;
const PAST_TITLE = 102;
const TIME_LEFT = 42;
const MIN_TITLE_LEFT = 112;

export const AGENDA_CAPACITY = Math.floor((FOOTER_TOP - CONTENT_TOP) / PITCH);

/**
 * The first visible row: the selected day's heading, so scrolling into a new
 * day starts its page; from the top while the first event still fits, so an
 * empty today stays in view; and scrolling within a day too long to fit.
 */
export function agendaScrollTop(rows: readonly AgendaRow[], selected: number): number {
  if (selected < 0) return 0;
  const firstEvent = rows.findIndex((row) => row.kind === "event");
  if (selected === firstEvent && selected < AGENDA_CAPACITY) return 0;
  let heading = selected;
  while (heading > 0 && rows[heading]!.kind !== "heading") heading--;
  return selected - heading < AGENDA_CAPACITY ? heading : selected - AGENDA_CAPACITY + 1;
}

export type AgendaView = {
  rows: readonly AgendaRow[];
  selected: number;
  footerRight: string;
};

export function paintAgenda(image: GrayImage, face: Face, view: AgendaView, scrollTop: number): void {
  paintFrame(image);
  const timeWidth = view.rows.reduce((width, row) => row.kind === "event" ? Math.max(width, face.measureLine(row.time)) : width, 0);
  const titleLeft = Math.max(MIN_TITLE_LEFT, TIME_LEFT + timeWidth + 14);
  let y = CONTENT_TOP;
  for (let index = scrollTop; index < view.rows.length && y + PITCH <= FOOTER_TOP; index++) {
    const row = view.rows[index]!;
    if (row.kind === "heading") {
      face.drawText(image, LEFT, y, fitLine(face, row.label, RIGHT - LEFT), HEADING);
    } else if (row.kind === "empty") {
      face.drawText(image, titleLeft, y, NOTHING_SCHEDULED, PAST_TITLE);
    } else {
      const active = index === view.selected;
      if (active) face.drawText(image, LEFT, y, ">", 255);
      face.drawText(image, TIME_LEFT, y, row.time, active ? 255 : row.past ? PAST_TIME : TIME);
      face.drawText(image, titleLeft, y, fitLine(face, row.event.title || "(untitled)", RIGHT - titleLeft), active ? 255 : row.past ? PAST_TITLE : TITLE);
    }
    y += PITCH;
  }
  paintFooter(image, face, "· Calendar", view.footerRight);
}

export type EventDetailView = {
  title: string;
  when: string;
  location: string;
  attendees: string;
  notes: string;
  footerRight: string;
};

export function paintEventDetail(image: GrayImage, face: Face, view: EventDetailView): void {
  paintFrame(image);
  const width = RIGHT - LEFT;
  let y = CONTENT_TOP;
  const lines = (text: string, value: number, max: number) => {
    for (const line of wrapCapped(face, text, width, max)) {
      if (y + PITCH > FOOTER_TOP) return;
      face.drawText(image, LEFT, y, line, value);
      y += PITCH;
    }
  };
  lines(view.title || "(untitled)", 255, 2);
  lines([view.when, view.location].filter(Boolean).join(" · "), 170, 2);
  if (view.attendees) lines(view.attendees, TIME, 1);
  const room = Math.floor((CONTENT_BOTTOM - y) / PITCH);
  if (view.notes && room > 0) {
    y += 8;
    lines(view.notes, DIM, room);
  }
  paintFooter(image, face, "· Event", view.footerRight);
}

/** Permission, loading and error states: a white line and a dim one. */
export function paintCalendarMessage(image: GrayImage, face: Face, title: string, detail: string): void {
  paintFrame(image);
  face.drawText(image, LEFT, CONTENT_TOP, fitLine(face, title, RIGHT - LEFT), 255);
  wrapCapped(face, detail, RIGHT - LEFT, 3).forEach((line, index) => face.drawText(image, LEFT, CONTENT_TOP + (index + 1) * PITCH, line, DIM));
  paintFooter(image, face, "· Calendar", "");
}
