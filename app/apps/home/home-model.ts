import type { CalendarEvent, CalendarReadState } from "../../native/calendar-types";

export const HOME_WINDOW_ID = "home";
export const HOME_SURFACE_ID = "window:home";
export const HOME_CARDS = [
  { id: "calendar", name: "Calendario", icon: "calendar", appId: "calendar" },
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

export type HomeCalendar = { events: CalendarEvent[]; status: string | null };
export function calendarCardState(
  permitted: boolean, events: readonly CalendarEvent[], nowMs: number, readState: CalendarReadState = "ready",
): HomeCalendar {
  if (!permitted) return { events: [], status: "Sin permiso de calendario" };
  const tomorrow = new Date(nowMs);
  tomorrow.setHours(24, 0, 0, 0);
  const upcoming = events.filter(event => event.endMs > nowMs && event.startMs < tomorrow.getTime())
    .sort((a, b) => a.startMs - b.startMs).slice(0, 2);
  if (upcoming.length) return { events: upcoming, status: null };
  return { events: [], status: readState === "loading" ? "Cargando calendario…"
    : readState === "error" ? "Calendario no disponible" : "Sin eventos hoy" };
}

export function emptyCardStatus(card: HomeCardId): string {
  switch (card) {
    case "calendar": return "Sin eventos hoy";
    case "music": return "Nada sonando";
    case "notifications": return "Sin notificaciones";
    case "translate": return "Toca para empezar";
    case "more": return "Toca para ver más apps";
  }
}

export function celsiusFromSnapshot(temperatureF: number | null | undefined): number | null {
  return temperatureF == null || !Number.isFinite(temperatureF) ? null : Math.round((temperatureF - 32) * 5 / 9);
}
