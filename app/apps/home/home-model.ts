import type { CalendarEvent, CalendarReadState } from "../../native/calendar-types";

export const HOME_WINDOW_ID = "home";
export const HOME_SURFACE_ID = "window:home";
export const HOME_CARDS = [
  { id: "calendar", name: "Calendario", icon: "calendar", appId: "calendar" },
  { id: "paseo", name: "Paseo", icon: "ai", appId: "paseo" },
  { id: "music", name: "Música", icon: "music", appId: "music" },
  { id: "notifications", name: "Notificaciones", icon: "bell", appId: "notifications" },
  { id: "translate", name: "Traducir", icon: "translate", appId: "microphones" },
  { id: "more", name: "Más", icon: "more", appId: "launcher" },
] as const;
export type HomeCardId = typeof HOME_CARDS[number]["id"];

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

export const HOME_WEEKDAYS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"] as const;
export type HomeCalendar = { events: CalendarEvent[]; nextEvent: CalendarEvent | null; status: string | null };
export function calendarCardState(
  permitted: boolean, events: readonly CalendarEvent[], nowMs: number, readState: CalendarReadState = "ready",
): HomeCalendar {
  if (!permitted) return { events: [], nextEvent: null, status: "Sin permiso de calendario" };
  const tomorrow = new Date(nowMs);
  tomorrow.setHours(24, 0, 0, 0);
  const upcoming = events.filter(event => event.endMs > nowMs).sort((a, b) => a.startMs - b.startMs);
  const today = upcoming.filter(event => event.startMs < tomorrow.getTime()).slice(0, 2);
  if (today.length) return { events: today, nextEvent: null, status: null };
  return { events: [], nextEvent: readState === "ready" ? upcoming[0] ?? null : null, status: readState === "loading" ? "Cargando calendario…"
    : readState === "error" ? "Calendario no disponible" : "Sin eventos hoy" };
}

export function emptyCardStatus(card: HomeCardId): string {
  switch (card) {
    case "calendar": return "Sin eventos hoy";
    case "paseo": return "Sin novedades";
    case "music": return "Nada sonando";
    case "notifications": return "Sin notificaciones";
    case "translate": return "Toca para empezar";
    case "more": return "Toca para ver más apps";
  }
}

const WEEKDAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTH_NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const clockTime = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

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
    date: `${WEEKDAY_NAMES[now.getDay()]} ${now.getDate()} ${MONTH_NAMES[now.getMonth()]}`,
    eventLine: calendar.status === "Sin eventos hoy" ? "Sin eventos" : null,
    nextLine: null,
    title: null,
  };
  const event = calendar.events[0] ?? calendar.nextEvent;
  if (!event || event.endMs <= now.getTime()) return state;
  const start = new Date(event.startMs);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  state.title = (event.title || "Sin título").replace(/[\r\n\t]/g, " ");
  if (event.startMs < tomorrow.getTime()) {
    const status = event.startMs <= now.getTime() ? "Ahora" : `en ${Math.ceil((event.startMs - now.getTime()) / 60_000)} min`;
    state.eventLine = `${event.allDay ? "Todo el día" : clockTime(start)} · ${status}`;
  } else {
    const dayAfterTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    const day = event.startMs < dayAfterTomorrow.getTime() ? "Mañana"
      : `${HOME_WEEKDAYS[start.getDay()]} ${start.getDate()} ${MONTH_NAMES[start.getMonth()]}`;
    state.eventLine = "Sin eventos hoy";
    state.nextLine = `${day} ${event.allDay ? "· Todo el día" : clockTime(start)}`;
  }
  return state;
}
