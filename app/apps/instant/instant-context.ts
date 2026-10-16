/**
 * What Instant already knows when the question arrives, gathered while the
 * user is still talking: time, weather, calendar, timers, music,
 * notifications, glasses, Paseo agents and an active route. Answering from
 * this block saves a tool round trip (~200 ms) per question.
 */
import { toolRegistry } from "../../assistant/tool-registry";
import { readWorkerState } from "../../ui/shell/worker-state";
import { createHomeWeather } from "../home/home-weather-source";
import { rainAhead } from "../home/home-weather";
import { PASEO_GLANCE_STATE_KEY, type PaseoGlanceSnapshot } from "../paseo/paseo-glance";

const READ_TIMEOUT_MS = 700;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const READS: [label: string, tool: string, args: Record<string, unknown>][] = [
  ["Calendar (next 36 h)", "calendar.list_events", { within_hours: 36, max_events: 4 }],
  ["Timers", "timer.list", {}],
  ["Alarms", "alarm.list", {}],
  ["Music", "media.now_playing", {}],
  ["Notifications", "notifications.list", { max: 5 }],
  ["Glasses", "glasses.get_state", {}],
  ["Route", "nav.route_status", {}],
];

export function nowLine(now = new Date(), region = ""): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `Now: ${WEEKDAYS[now.getDay()]} ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())} (${zone}${region ? `, country ${region}` : ""})`;
}

function weatherWords(code: number): string {
  if (code === 0) return "clear";
  if (code <= 3) return "partly cloudy";
  if (code <= 48) return "fog";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  return "thunderstorm";
}

function weatherLine(nowMs: number): string {
  const reading = createHomeWeather().reading();
  if (!reading) return "";
  const rain = rainAhead(reading, nowMs);
  const rainText = rain ? `, ${rain.percent}% chance of rain at ${new Date(rain.atMs).getHours()}:00` : "";
  return `Weather here: ${Math.round(reading.temperatureC)}°C, ${weatherWords(reading.code)}${rainText}`;
}

function paseoLine(): string {
  const snapshot = readWorkerState(PASEO_GLANCE_STATE_KEY) as PaseoGlanceSnapshot | undefined;
  if (!snapshot?.configured || snapshot.status) return "";
  return `Paseo coding agents: ${snapshot.working} working, ${snapshot.needs} waiting for the user`;
}

async function read(label: string, tool: string, args: Record<string, unknown>): Promise<string> {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), READ_TIMEOUT_MS));
  const result = await Promise.race([toolRegistry.callTool(tool, args).catch(() => null), timeout]);
  return result?.ok && result.content ? `${label}: ${result.content.replace(/\n/g, "; ")}` : "";
}

export async function gatherContext(region: string): Promise<string> {
  const now = new Date();
  const local = [nowLine(now, region), weatherLine(now.getTime()), paseoLine()];
  const reads = await Promise.all(READS.map(([label, tool, args]) => read(label, tool, args)));
  return [...local, ...reads].filter(Boolean).join("\n");
}
