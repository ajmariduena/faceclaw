/**
 * Google Maps Platform REST for Navigate: Places Autocomplete (New) for the
 * destination search, and Map Tiles API 2D roadmap tiles (roads only) for the
 * street network around the route. The same key drives the Navigation SDK.
 * Terms 12.2 forbid mixing Navigation SDK content with a non-Google map, so
 * every street drawn under a route must come from these tiles.
 */
import { GrayImage } from "../graphics/image";
import { getStringSetting } from "./settings-store";
import { decodeImageBytes } from "./image-bytes";
import { fetchWithUserAgent } from "../util/http";

export const GOOGLE_MAPS_KEY_SETTING_KEY = "maps.googleApiKey";
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const NEARBY_RADIUS_M = 5_000;
const TILE_ROOT = "https://tile.googleapis.com/v1";
const FETCH_TIMEOUT_MS = 12_000;
export const TILE_SIZE = 256;

export type PlaceSuggestion = {
  placeId: string;
  name: string;
  detail: string;
  distanceMeters: number | null;
};

export function getGoogleMapsKey(): string {
  return (getStringSetting(GOOGLE_MAPS_KEY_SETTING_KEY, "") ?? "").trim();
}

export function isGoogleMapsConfigured(): boolean {
  return getGoogleMapsKey().length > 0;
}

/** A fresh token for one search: Google groups the keystrokes of a session. */
export function newSearchSession(): string {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}

export async function autocompletePlaces(
  input: string,
  origin: { latitude: number; longitude: number } | null,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  const body: Record<string, unknown> = { input, sessionToken, languageCode: "es" };
  if (origin) {
    const center = { latitude: origin.latitude, longitude: origin.longitude };
    body.origin = center;
    body.locationBias = { circle: { center, radius: 50_000 } };
  }
  const response = await withTimeout(fetchWithUserAgent(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": requireKey() },
    body: JSON.stringify(body),
  }), "Google search");
  if (!response.ok) throw new Error(await failure(response, "Google search"));
  const json: any = await response.json();
  const out: PlaceSuggestion[] = [];
  for (const suggestion of Array.isArray(json?.suggestions) ? json.suggestions : []) {
    const place = suggestion?.placePrediction;
    if (!place?.placeId) continue;
    const name = String(place.structuredFormat?.mainText?.text ?? place.text?.text ?? "").trim();
    if (!name) continue;
    out.push({
      placeId: String(place.placeId),
      name,
      detail: String(place.structuredFormat?.secondaryText?.text ?? "").trim(),
      distanceMeters: Number.isFinite(Number(place.distanceMeters)) ? Number(place.distanceMeters) : null,
    });
  }
  return out;
}

/** The closest places of one Places type (e.g. "pharmacy"), nearest first. */
export async function nearbyPlaces(type: string, origin: { latitude: number; longitude: number }): Promise<PlaceSuggestion[]> {
  const center = { latitude: origin.latitude, longitude: origin.longitude };
  const response = await withTimeout(fetchWithUserAgent(NEARBY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": requireKey(),
      "X-Goog-FieldMask": "places.id,places.displayName,places.shortFormattedAddress,places.location",
    },
    body: JSON.stringify({
      includedTypes: [type],
      maxResultCount: 10,
      rankPreference: "DISTANCE",
      languageCode: "es",
      locationRestriction: { circle: { center, radius: NEARBY_RADIUS_M } },
    }),
  }), "Google search");
  if (!response.ok) throw new Error(await failure(response, "Google search"));
  const json: any = await response.json();
  const out: PlaceSuggestion[] = [];
  for (const place of Array.isArray(json?.places) ? json.places : []) {
    const name = String(place?.displayName?.text ?? "").trim();
    if (!place?.id || !name) continue;
    const latitude = Number(place.location?.latitude), longitude = Number(place.location?.longitude);
    out.push({
      placeId: String(place.id),
      name,
      detail: String(place.shortFormattedAddress ?? "").trim(),
      distanceMeters: Number.isFinite(latitude) && Number.isFinite(longitude) ? Math.round(distanceMeters(origin, { latitude, longitude })) : null,
    });
  }
  return out;
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Roads only, on black: local streets dim and thin, avenues brighter. The
 * gray of each pixel is already the brightness the lens should draw before
 * the fade, so the worker only scales it.
 */
const ROADS_ONLY_STYLE = [
  { stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#000000" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#000000" }] },
  { featureType: "road.local", elementType: "geometry.fill", stylers: [{ visibility: "on" }, { color: "#484848" }, { weight: 1 }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ visibility: "on" }, { color: "#767676" }, { weight: 2 }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ visibility: "on" }, { color: "#767676" }, { weight: 2 }] },
];

/** Session-cached 2D roadmap tiles; a tile is fetched once and then drawn rotated every frame. */
export class RoadTiles {
  private session: { token: string; expiresAtMs: number } | null = null;
  private sessionRequest: Promise<string> | null = null;
  private readonly tiles = new Map<string, GrayImage | "pending" | "failed">();
  private failedSession = false;

  constructor(private readonly onTileLoaded: () => void, private readonly maxTiles = 160) {}

  /** The tile when cached; otherwise starts fetching it and returns null. */
  tile(zoom: number, x: number, y: number): GrayImage | null {
    const key = `${zoom}/${x}/${y}`;
    const cached = this.tiles.get(key);
    if (cached instanceof GrayImage) {
      this.tiles.delete(key);
      this.tiles.set(key, cached);
      return cached;
    }
    if (cached || this.failedSession) return null;
    this.tiles.set(key, "pending");
    void this.load(key, zoom, x, y);
    return null;
  }

  clear(): void {
    this.tiles.clear();
    this.failedSession = false;
  }

  private async load(key: string, zoom: number, x: number, y: number): Promise<void> {
    try {
      const token = await this.sessionToken();
      const response = await withTimeout(fetchWithUserAgent(
        `${TILE_ROOT}/2dtiles/${zoom}/${x}/${y}?session=${encodeURIComponent(token)}&key=${encodeURIComponent(requireKey())}`,
      ), "Google tile");
      if (!response.ok) {
        if (response.status === 400 || response.status === 401 || response.status === 403) this.session = null;
        throw new Error(`HTTP ${response.status}`);
      }
      const image = decodeImageBytes(await response.arrayBuffer(), TILE_SIZE, TILE_SIZE);
      if (!image) throw new Error("undecodable tile");
      this.tiles.set(key, image);
      while (this.tiles.size > this.maxTiles) {
        const oldest = this.tiles.keys().next().value;
        if (oldest === undefined) break;
        this.tiles.delete(oldest);
      }
      this.onTileLoaded();
    } catch (error) {
      console.warn(`navigate tile ${key} failed: ${error}`);
      this.tiles.set(key, "failed");
    }
  }

  private sessionToken(): Promise<string> {
    if (this.session && this.session.expiresAtMs > Date.now() + 60_000) return Promise.resolve(this.session.token);
    this.sessionRequest ??= this.createSession().finally(() => { this.sessionRequest = null; });
    return this.sessionRequest;
  }

  private async createSession(): Promise<string> {
    const response = await withTimeout(fetchWithUserAgent(`${TILE_ROOT}/createSession?key=${encodeURIComponent(requireKey())}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapType: "roadmap", language: "es-419", region: "EC", scale: "scaleFactor1x", styles: ROADS_ONLY_STYLE }),
    }), "Google map session");
    if (!response.ok) {
      if (response.status === 403) this.failedSession = true;
      throw new Error(await failure(response, "Google map session"));
    }
    const json: any = await response.json();
    const token = String(json?.session ?? "");
    if (!token) throw new Error("Google map session returned no token.");
    const expiry = Number(json?.expiry);
    this.session = { token, expiresAtMs: Number.isFinite(expiry) ? expiry * 1000 : Date.now() + 3_600_000 };
    return token;
  }
}

/** Web Mercator world pixel at `zoom` for a coordinate (256-px tiles). */
export function worldPixel(latitude: number, longitude: number, zoom: number): [number, number] {
  const scale = TILE_SIZE * 2 ** zoom;
  const sin = Math.min(0.9999, Math.max(-0.9999, Math.sin((latitude * Math.PI) / 180)));
  return [((longitude + 180) / 360) * scale, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale];
}

function requireKey(): string {
  const key = getGoogleMapsKey();
  if (!key) throw new Error("Add a Google Maps key on the phone first.");
  return key;
}

async function failure(response: Response, label: string): Promise<string> {
  let detail = "";
  try {
    const body: any = await response.json();
    detail = String(body?.error?.message ?? "");
  } catch {
    // Non-JSON error body; the status is enough.
  }
  return `${label} failed (HTTP ${response.status}${detail ? `: ${detail}` : ""}).`;
}

async function withTimeout<T>(request: Promise<T>, label: string): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    handle = setTimeout(() => reject(new Error(`${label} timed out.`)), FETCH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}
