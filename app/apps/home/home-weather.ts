/**
 * The home column's weather complication: Open-Meteo's current temperature
 * and WMO weather code for the phone's location, refreshed at most every 30
 * minutes, cached in the settings store, and silent about every failure (the
 * complication stays hidden until there is a value). Celsius, no API key.
 * No NativeScript imports: the native boundaries arrive as `HomeWeatherDeps`.
 */
import type { IconName } from "../../graphics/icons";

export type HomeWeatherReading = {
  temperatureC: number;
  /** WMO weather interpretation code (Open-Meteo `weather_code`). */
  code: number;
  isDay: boolean;
  /** When the reading was fetched, epoch ms. */
  atMs: number;
};

export type HomeWeatherDeps = {
  permitted(): boolean;
  locate(): Promise<{ latitude: number; longitude: number }>;
  fetchJson(url: string): Promise<unknown>;
  read(key: string, fallback: string): string;
  write(key: string, value: string): void;
  now(): number;
};

export const HOME_WEATHER_REFRESH_MS = 30 * 60_000;
export const HOME_WEATHER_RETRY_MS = 10 * 60_000;
/** A reading older than this is hidden rather than shown as current. */
export const HOME_WEATHER_STALE_MS = 3 * 60 * 60_000;
const FETCH_TIMEOUT_MS = 20_000;
const CACHE_KEY = "home.weather";
const CACHE_VERSION = 1;

export function openMeteoUrl(latitude: number, longitude: number): string {
  return `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}&current=temperature_2m,weather_code,is_day`;
}

/** The reading in an Open-Meteo `/v1/forecast?current=…` body, or null when it lacks one. */
export function parseOpenMeteo(body: unknown, nowMs: number): HomeWeatherReading | null {
  const current = (body as { current?: Record<string, unknown> } | null)?.current;
  if (!current || typeof current !== "object") return null;
  const temperatureC = Number(current.temperature_2m);
  const code = Number(current.weather_code);
  if (!Number.isFinite(temperatureC) || !Number.isInteger(code)) return null;
  return { temperatureC, code, isDay: current.is_day === undefined ? true : Number(current.is_day) === 1, atMs: nowMs };
}

/** WMO code groups (https://open-meteo.com/en/docs#weather_variable_documentation) on the column's icons. */
export function weatherIcon(code: number, isDay: boolean): IconName {
  if (code === 0) return isDay ? "sun" : "moon";
  if (code <= 2) return isDay ? "cloud-sun" : "cloud-moon";
  if (code >= 95) return "cloud-lightning";
  if (code >= 51) return "cloud-rain";
  return "cloud";
}

export function weatherLabel(reading: HomeWeatherReading): string {
  return `${Math.round(reading.temperatureC)}°`;
}

export class HomeWeather {
  private cached: HomeWeatherReading | null | undefined;
  private lastAttemptMs = -Infinity;
  private inFlight = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: HomeWeatherDeps) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** The latest reading, or null when there is none or it is too old to show. */
  reading(): HomeWeatherReading | null {
    const reading = this.stored();
    return reading && this.deps.now() - reading.atMs <= HOME_WEATHER_STALE_MS ? reading : null;
  }

  /** Fetch when due: 30 min after the last reading, 10 min after a failure, never without permission. */
  refresh(): void {
    const now = this.deps.now();
    if (this.inFlight || now < this.nextAttemptMs() || !this.deps.permitted()) return;
    this.inFlight = true;
    this.lastAttemptMs = now;
    void this.load().catch((error: unknown) => { console.warn(`home weather: ${error}`); })
      .finally(() => { this.inFlight = false; });
  }

  private nextAttemptMs(): number {
    const reading = this.stored();
    return Math.max(reading ? reading.atMs + HOME_WEATHER_REFRESH_MS : -Infinity, this.lastAttemptMs + HOME_WEATHER_RETRY_MS);
  }

  private stored(): HomeWeatherReading | null {
    if (this.cached === undefined) {
      this.cached = null;
      try {
        const raw = this.deps.read(CACHE_KEY, "");
        const cache = raw ? JSON.parse(raw) as { version?: number; reading?: HomeWeatherReading } : null;
        const reading = cache?.version === CACHE_VERSION ? cache.reading : undefined;
        if (reading && Number.isFinite(reading.temperatureC) && Number.isFinite(reading.atMs)) this.cached = reading;
      } catch {
        this.cached = null;
      }
    }
    return this.cached;
  }

  private async load(): Promise<void> {
    const location = await this.deps.locate();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("timed out")), FETCH_TIMEOUT_MS);
    });
    let body: unknown;
    try {
      body = await Promise.race([this.deps.fetchJson(openMeteoUrl(location.latitude, location.longitude)), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const reading = parseOpenMeteo(body, this.deps.now());
    if (!reading) throw new Error("no current weather in the response");
    this.cached = reading;
    try {
      this.deps.write(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, reading }));
    } catch (error) {
      console.warn(`home weather cache: ${error}`);
    }
    for (const listener of Array.from(this.listeners)) listener();
  }
}
