/**
 * Navigate app worker: Google Places search, Google Navigation SDK guidance
 * and the minimal guidance screen (nav-render.ts) over Google road tiles.
 * Design and terms notes: research/navigate/google.md, minimal-fable.md.
 */
import "@nativescript/core/globals";
import { finishWorkerShutdown } from "../../ui/shell/worker-lifecycle";
import { GrayImage } from "../../graphics/image";
import { flattenPlanesWithDraws, planesFingerprint, type Plane } from "../../graphics/plane";
import { prepareFrameDraws } from "../../graphics/glyph-wire";
import { getDefaultSmallFont } from "../../graphics/ui-fonts";
import { TtfFont } from "../../graphics/ttf-font";
import { ensurePreinstalledFonts, installedFontPath } from "../../graphics/installed-fonts";
import { fitLine } from "../../graphics/terminal-painter";
import * as frameTimings from "../../native/frame-timings";
import { getActiveDisplay } from "../../native/active-display";
import { onSettingsStoreChanged } from "../../native/settings-store";
import { drawRightValueMenuItem, drawSubmenuIndicator, drawToggleMenuItem, submenuItem, type MenuItem } from "../../ui/menu";
import { WindowMenu, WindowMenuLayer } from "../../ui/window-menu";
import type { LayerContext } from "../../ui/layers";
import { truncateText } from "../../graphics/textwrap";
import { terminalFace } from "../../ui/terminal-face";
import { listScrollTop, paintTerminalList, stepSelection, type TerminalRow } from "../../ui/terminal";
import {
  enumSettingMenuItem,
  navigateDestinationAddressDraftSetting,
  navigateDestinationNameDraftSetting,
  navigateDisplayModeSetting,
  navigateRememberRecentSetting,
  navigateSearchDraftSetting,
  navigateTravelModeSetting,
  navigateVerticalPositionSetting,
  type ConfigSettingString,
} from "../../ui/dashboard-settings";
import {
  addCustomDestination,
  clearRecentDestinations,
  findSavedDestinationByName,
  HOME_DESTINATION_ID,
  loadRecentDestinations,
  loadSavedDestinations,
  rememberRecentDestination,
  removeCustomDestination,
  removeRecentDestination,
  setDestinationAddress,
  updateCustomDestination,
  WORK_DESTINATION_ID,
  type RecentDestination,
  type SavedDestination,
} from "./destinations";
import type { WorkerAppMessage, WorkerAppReply } from "../../ui/shell/worker-window";
import type { ToolResult, ToolSpec } from "../../assistant/tool-registry";
import type { InputEvent } from "../../ui/gestures";
import {
  addCompassListener,
  COMPASS_CALIBRATION_STARTED,
  COMPASS_CHANGED,
  handleNavigationSensorEvent,
  LocationTracker,
  magneticDeclinationDegrees,
  setCompassEnabled,
  type CompassEvent,
  type TrackedLocation,
} from "./navigation-sensors";
import {
  autocompletePlaces,
  getGoogleMapsKey,
  GOOGLE_MAPS_KEY_SETTING_KEY,
  newSearchSession,
  RoadTiles,
  worldPixel,
  type PlaceSuggestion,
} from "../../native/google-maps";
import { GoogleNavigation, type NavEvent, type NavStep, type TravelMode } from "../../native/google-navigation";
import { calibrateHeading, normalizeHeading } from "../compass/calibration";
import { angleDelta, compassQuality, HeadingModel, type HeadingOutput } from "./heading-model";
import { paintGuidance, formatDistance, type GuidanceFonts, type GuidanceView, type StreetMap } from "./nav-render";

declare const global: any;

const HEADING_TICK_MS = 250;
/** The map only repaints for a rotation once it has turned this far. */
const RENDER_STEP_DEG = 2;
const COMPASS_HINT_MS = 8_000;
const COMPASS_HINT = "Brújula imprecisa. Al detenerte, mueve suavemente la cabeza en varias direcciones.";
const COMPASS_OWNER = "navigate";
const SEARCH_DEBOUNCE_MS = 350;
const ARRIVED_HOLD_MS = 8_000;
/** Within this distance of the next maneuver the cluster turns bright. */
const NEAR_METERS = 300;
const NAVIGATE_SEARCH_DRAFT_KEY = "navigate.searchDraft";

const smallFont = getDefaultSmallFont();
ensurePreinstalledFonts();
const numberFontPath = installedFontPath("Roboto-Light.ttf");
let guidanceFonts: GuidanceFonts | null = null;

const TRAVEL_MODES: TravelMode[] = ["driving", "walking", "two-wheeler"];

const NAVIGATE_TOOLS: ToolSpec[] = [
  {
    name: "start_route",
    description:
      "Start turn-by-turn navigation to a destination. Give the destination as free text (a place name, business, or address); Google resolves it near the user's current location. The name of one of the user's saved destinations (e.g. 'Casa', 'Trabajo', 'home', 'work') is used directly. Returns the resolved destination. If the wrong place was picked, call again with a more specific query.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Destination to search for, e.g. 'Mall del Sol' or 'Av. 9 de Octubre 100, Guayaquil'." },
        profile: { type: "string", enum: TRAVEL_MODES, description: "Travel mode (default: the user's Navigate setting)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    availability: "open",
    // Under the 15 s host backstop; search plus Google's route can be slow.
    timeoutMs: 14_000,
  },
  {
    name: "stop_route",
    description: "Stop the current navigation session.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    availability: "open",
  },
  {
    name: "route_status",
    description: "Get the current navigation status: next maneuver and street, distance to it, and remaining distance and time.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    availability: "open",
  },
];

type NavWindow = {
  windowId: string;
  surfaceId: string;
  title: string;
  viewportWidth: number;
  viewportHeight: number;
  foreground: boolean;
  focused: boolean;
  menu: WindowMenu | null;
  lastSubmittedFingerprint: string;
};

type Phase = "idle" | "search" | "starting" | "guiding" | "arrived";
type Target = { placeId: string; latitude: number; longitude: number; title: string; detail: string };
type IdleRow =
  | { kind: "search" }
  | { kind: "saved"; destination: SavedDestination }
  | { kind: "recent"; destination: RecentDestination };

let window: NavWindow | null = null;
let screenOn = true;
let phase: Phase = "idle";
let statusMessage = "";

let idleSelected = 0;
let idleTop = 0;

let query = "";
let suggestions: PlaceSuggestion[] = [];
let searchSelected = 0;
let searchTop = 0;
let searchState: "empty" | "searching" | "done" | "error" = "empty";
let searchError = "";
let searchSession = "";
let searchGeneration = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

/** Name and address edits for saved destinations (phone editor, click confirms). */
type DestinationEdit = { setting: ConfigSettingString; title: string; onDone: (value: string) => void };
let editing: DestinationEdit | null = null;

const google = new GoogleNavigation();
let googleStarted = false;
let googleReady = false;
let target: Target | null = null;
let tripMode: TravelMode = "driving";
/** A start_route call waiting for Google's route result. */
let tripWaiter: { resolve: (summary: string) => void; reject: (error: Error) => void } | null = null;
/** Recents get the trip only when it was picked from search or recents, not a saved place. */
let rememberTrip = true;
let tripGeneration = 0;
let lastNav: Extract<NavEvent, { type: "nav" }> | null = null;
let routeLatLng: Array<[number, number]> = [];
let routeWorld: Array<[number, number]> = [];
let routeWorldZoom = -1;
let routeIndex = 0;
let rerouting = false;
let arrivedSide: "left" | "right" | null = null;
let arrivedTimer: ReturnType<typeof setTimeout> | null = null;
let position: { latitude: number; longitude: number } | null = null;
const heading = new HeadingModel();
/** What the last painted frame used, to repaint only when the map would visibly change. */
let paintedHeading: HeadingOutput | null = null;
let headingTimer: ReturnType<typeof setInterval> | null = null;
let compassHintUntilMs = 0;
let compassHintShown = false;

let lastFix: TrackedLocation | null = null;
const tracker = new LocationTracker({
  onLocation: (fix) => {
    lastFix = fix;
    if (phase === "idle") render();
  },
  onError: (message) => console.warn(`navigate location: ${message}`),
});

const tiles = new RoadTiles(() => {
  if (phase === "guiding" || phase === "starting" || phase === "arrived") render();
});

let compassActive = false;
let unsubscribeCompass: (() => void) | null = null;

function post(message: WorkerAppReply): void {
  global.postMessage(message);
}

onSettingsStoreChanged((key) => {
  if (key === NAVIGATE_SEARCH_DRAFT_KEY && phase === "search") {
    setQuery(navigateSearchDraftSetting.get());
    return;
  }
  if (key === GOOGLE_MAPS_KEY_SETTING_KEY) tiles.clear();
  if (key.startsWith("navigate.") || key === GOOGLE_MAPS_KEY_SETTING_KEY) render();
});

post({ type: "worker-ready" });

global.onmessage = (event: { data: WorkerAppMessage }) => {
  const message = event.data;
  switch (message.type) {
    case "check-idle":
      post({ type: "worker-idle" });
      break;
    case "shutdown":
      finishWorkerShutdown();
      break;
    case "navigation-sensors":
      handleNavigationSensorEvent(message.event);
      break;
    case "open-window":
      window = {
        windowId: message.windowId,
        surfaceId: message.surfaceId,
        title: message.title,
        viewportWidth: message.viewport.width,
        viewportHeight: message.viewport.height,
        foreground: false,
        focused: false,
        menu: null,
        lastSubmittedFingerprint: "",
      };
      post({ type: "set-tools", windowId: message.windowId, tools: NAVIGATE_TOOLS });
      reconcileTracking();
      break;
    case "tool-call": {
      const callId = message.callId;
      handleNavigateTool(message.name, message.args)
        .then((result) => post({ type: "tool-result", callId, result }))
        .catch((error) => post({ type: "tool-result", callId, result: { ok: false, error: String((error as Error)?.message ?? error) } }));
      break;
    }
    case "resize-window":
      if (!window || window.windowId !== message.windowId) break;
      if (window.viewportWidth === message.viewport.width && window.viewportHeight === message.viewport.height) break;
      window.viewportWidth = message.viewport.width;
      window.viewportHeight = message.viewport.height;
      window.menu?.resize(message.viewport);
      window.lastSubmittedFingerprint = "";
      render();
      break;
    case "close-window":
      if (editing || phase === "search") post({ type: "end-text-setting-edit" });
      editing = null;
      stopTrip("");
      phase = "idle";
      google.detach();
      googleStarted = false;
      googleReady = false;
      window = null;
      reconcileTracking();
      reconcileCompass();
      break;
    case "input":
      if (!window || window.windowId !== message.windowId) {
        frameTimings.finishFrame(message.frameId, "discarded: unknown navigate window");
        break;
      }
      window.focused = message.focused;
      frameTimings.logFrame(message.frameId, `input received in ${message.windowId} worker`);
      handleInput(window, message.event as InputEvent, message.frameId);
      break;
    case "text-input": {
      const text = message.text.trim();
      if (editing) {
        editing.setting.set(text);
        render();
      } else if (text) {
        if (phase !== "search") beginSearch();
        navigateSearchDraftSetting.set(text);
        setQuery(text);
      }
      break;
    }
    case "render":
      if (!window) break;
      window.focused = message.focused;
      render();
      break;
    case "foreground":
      if (!window) break;
      window.foreground = message.foreground;
      window.focused = message.focused;
      reconcileTracking();
      render();
      break;
    case "screen":
      screenOn = message.on;
      reconcileCompass();
      if (screenOn) render();
      break;
    default:
      break;
  }
};

// ---------------------------------------------------------------------------
// Search

function beginSearch(): void {
  phase = "search";
  statusMessage = "";
  query = "";
  suggestions = [];
  searchSelected = 0;
  searchTop = 0;
  searchState = "empty";
  searchSession = newSearchSession();
  navigateSearchDraftSetting.set("");
  post({ type: "start-text-setting-edit", settingId: navigateSearchDraftSetting.id });
  render();
}

function endSearch(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = null;
  searchGeneration++;
  post({ type: "end-text-setting-edit" });
}

function setQuery(text: string): void {
  query = text.trim();
  if (searchTimer) clearTimeout(searchTimer);
  const generation = ++searchGeneration;
  if (!query) {
    suggestions = [];
    searchState = "empty";
    render();
    return;
  }
  searchState = "searching";
  render();
  searchTimer = setTimeout(() => {
    searchTimer = null;
    const origin = lastFix ? { latitude: lastFix.latitude, longitude: lastFix.longitude } : null;
    autocompletePlaces(query, origin, searchSession)
      .then((found) => {
        if (generation !== searchGeneration) return;
        suggestions = found;
        searchSelected = 0;
        searchTop = 0;
        searchState = "done";
        render();
      })
      .catch((error) => {
        if (generation !== searchGeneration) return;
        searchState = "error";
        searchError = String((error as Error)?.message ?? error);
        render();
      });
  }, SEARCH_DEBOUNCE_MS);
}

function pickSuggestion(suggestion: PlaceSuggestion): void {
  endSearch();
  startTrip({ placeId: suggestion.placeId, latitude: 0, longitude: 0, title: suggestion.name, detail: suggestion.detail });
}

/** Saved destinations hold plain addresses; Google's first suggestion gives the place to route to. */
function navigateToSaved(destination: SavedDestination, mode = navigateTravelModeSetting.get()): void {
  phase = "starting";
  statusMessage = "";
  const generation = ++tripGeneration;
  render();
  const origin = lastFix ? { latitude: lastFix.latitude, longitude: lastFix.longitude } : null;
  autocompletePlaces(destination.address, origin, newSearchSession())
    .then((found) => {
      if (generation !== tripGeneration) return;
      const first = found[0];
      if (!first) throw new Error(`No encontré «${destination.address}».`);
      startTrip({ placeId: first.placeId, latitude: 0, longitude: 0, title: destination.name, detail: destination.address }, false, mode);
    })
    .catch((error) => {
      if (generation !== tripGeneration) return;
      failTrip(String((error as Error)?.message ?? error));
    });
}

// ---------------------------------------------------------------------------
// Trip

function startTrip(next: Target, remember = true, mode = navigateTravelModeSetting.get()): void {
  const key = getGoogleMapsKey();
  if (!key) {
    failTrip("Agrega la clave de Google Maps en el teléfono.");
    return;
  }
  target = next;
  tripMode = mode;
  rememberTrip = remember;
  tripGeneration++;
  phase = "starting";
  statusMessage = "";
  lastNav = null;
  routeLatLng = [];
  routeWorld = [];
  routeIndex = 0;
  rerouting = false;
  arrivedSide = null;
  position = null;
  resetHeading();
  reconcileTracking();
  if (!googleStarted) {
    googleStarted = true;
    google.start(key, handleNavEvent);
  } else if (googleReady) {
    google.navigateTo(next, tripMode);
  }
  if (window) post({ type: "focus-window", windowId: window.windowId });
  render();
}

function stopTrip(message: string): void {
  if (arrivedTimer) clearTimeout(arrivedTimer);
  arrivedTimer = null;
  if (phase === "starting" || phase === "guiding" || phase === "arrived") google.stop();
  tripGeneration++;
  settleTripWaiter(message || "Navigation stopped.");
  target = null;
  lastNav = null;
  routeLatLng = [];
  routeWorld = [];
  rerouting = false;
  phase = "idle";
  statusMessage = message;
  resetHeading();
  reconcileTracking();
  reconcileCompass();
}

function failTrip(message: string): void {
  stopTrip(message);
  render();
}

const ERRORS: Record<string, string> = {
  terms: "Acepta los términos de Google en el teléfono.",
  "not-authorized": "La clave de Google no tiene Navigation SDK.",
  restart: "Reinicia Faceclaw para usar la nueva clave.",
  "location-permission": "Falta el permiso de ubicación precisa.",
  network: "Sin conexión.",
  NO_ROUTE_FOUND: "No encontré una ruta.",
  NETWORK_ERROR: "Sin conexión.",
  QUOTA_CHECK_FAILED: "La clave de Google no tiene cuota.",
  LOCATION_DISABLED: "La ubicación está apagada.",
  LOCATION_UNKNOWN: "Todavía no sé dónde estás.",
  WAYPOINT_ERROR: "Google no reconoce ese lugar.",
  ROUTING_TIMEOUT: "Google tardó demasiado; intenta otra vez.",
};

function handleNavEvent(event: NavEvent): void {
  switch (event.type) {
    case "ready":
      googleReady = true;
      if (phase === "starting" && target) google.navigateTo(target, tripMode);
      return;
    case "error":
      if (!googleReady) googleStarted = false;
      if (phase === "starting" || phase === "guiding") failTrip(ERRORS[event.code] ?? `Google: ${event.code}`);
      return;
    case "status":
      if (phase !== "starting") return;
      if (event.status === "OK") {
        phase = "guiding";
        settleTripWaiter(null);
        reconcileCompass();
        render();
      } else if (event.status !== "ROUTE_CANCELED") {
        failTrip(ERRORS[event.status] ?? `Google: ${event.status}`);
      }
      return;
    case "route":
      routeLatLng = event.points;
      routeWorldZoom = -1;
      routeIndex = 0;
      rerouting = false;
      if (target && rememberTrip && routeLatLng.length) {
        const [latitude, longitude] = routeLatLng[routeLatLng.length - 1]!;
        rememberRecentDestination({ name: target.title, place: target.detail, placeId: target.placeId, latitude, longitude });
      }
      render();
      return;
    case "nav":
      if (phase !== "guiding" && phase !== "starting") return;
      lastNav = event;
      rerouting = event.state === "REROUTING";
      if (event.step?.maneuver.startsWith("DESTINATION")) {
        arrivedSide = event.step.maneuver.endsWith("LEFT") ? "left" : event.step.maneuver.endsWith("RIGHT") ? "right" : null;
      }
      render();
      return;
    case "location":
      position = { latitude: event.lat, longitude: event.lng };
      heading.courseFix({
        bearing: event.bearing,
        speed: event.speed,
        accuracyM: event.accuracy >= 0 ? event.accuracy : null,
        bearingAccuracyDeg: event.bearingAccuracy >= 0 ? event.bearingAccuracy : null,
      }, Date.now());
      advanceRouteIndex();
      if (phase === "guiding" || phase === "arrived") render();
      return;
    case "rerouting":
      rerouting = true;
      render();
      return;
    case "arrived":
      if (!event.final || phase !== "guiding") return;
      phase = "arrived";
      google.stop();
      reconcileCompass();
      arrivedTimer = setTimeout(() => {
        arrivedTimer = null;
        if (phase === "arrived") {
          stopTrip("");
          render();
        }
      }, ARRIVED_HOLD_MS);
      render();
      return;
  }
}

// ---------------------------------------------------------------------------
// Assistant tools

const SAVED_ALIASES: Record<string, string> = { home: "Casa", work: "Trabajo" };

async function handleNavigateTool(name: string, args: any): Promise<ToolResult> {
  switch (name) {
    case "start_route": {
      const wanted = String(args?.query ?? "").trim();
      if (!wanted) return { ok: false, error: "start_route requires a destination query" };
      if (!getGoogleMapsKey()) return { ok: false, error: "Add a Google Maps key on the phone first (API Keys > Google Maps)." };
      const requested = String(args?.profile ?? "") as TravelMode;
      const mode = TRAVEL_MODES.includes(requested) ? requested : navigateTravelModeSetting.get();
      const saved = findSavedDestinationByName(SAVED_ALIASES[wanted.toLowerCase()] ?? wanted);
      let first: PlaceSuggestion | undefined;
      if (!saved?.address) {
        const origin = lastFix ? { latitude: lastFix.latitude, longitude: lastFix.longitude } : null;
        first = (await autocompletePlaces(wanted, origin, newSearchSession()))[0];
        if (!first) return { ok: false, error: `No place found for "${wanted}".` };
      }
      const done = new Promise<string>((resolve, reject) => {
        settleTripWaiter("Replaced by a new route.");
        tripWaiter = { resolve, reject };
      });
      if (first) startTrip({ placeId: first.placeId, latitude: 0, longitude: 0, title: first.name, detail: first.detail }, true, mode);
      else if (saved) navigateToSaved(saved, mode);
      try {
        return { ok: true, content: await done };
      } catch (error) {
        return { ok: false, error: String((error as Error)?.message ?? error) };
      }
    }
    case "stop_route":
      if (phase === "idle" || phase === "search") return { ok: true, content: "Navigation was not active." };
      stopTrip("");
      render();
      return { ok: true, content: "Navigation stopped." };
    case "route_status":
      return { ok: true, content: describeRouteStatus() };
    default:
      return { ok: false, error: `Unknown navigate tool: ${name}` };
  }
}

/** null resolves the waiting start_route call; a message rejects it. */
function settleTripWaiter(error: string | null): void {
  const waiter = tripWaiter;
  if (!waiter) return;
  tripWaiter = null;
  if (error !== null) waiter.reject(new Error(error));
  else waiter.resolve(`Navigating to ${target?.title ?? "the destination"}${target?.detail ? ` (${target.detail})` : ""} by ${navigateTravelModeSetting.displayValue(tripMode)}.`);
}

function describeRouteStatus(): string {
  if (phase === "arrived") return `Arrived at ${target?.title ?? "the destination"}.`;
  if (phase === "starting") return `Finding a route to ${target?.title ?? "the destination"}.`;
  if (phase !== "guiding" || !target) return "Navigation is not active.";
  if (rerouting) return `Rerouting to ${target.title}.`;
  if (!lastNav) return `Navigating to ${target.title}; waiting for the first position.`;
  const parts = [`Navigating to ${target.title}.`];
  const step = lastNav.step;
  if (step) parts.push(`Next: ${step.instruction || step.maneuver} in ${Math.round(Math.max(0, lastNav.stepMeters))} m.`);
  if (lastNav.destMeters >= 0) parts.push(`${(lastNav.destMeters / 1000).toFixed(1)} km and ${Math.round(Math.max(0, lastNav.destSeconds) / 60)} min left.`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Map

function travelZoom(): number {
  return tripMode === "walking" ? 17 : 16;
}

function routeInWorld(zoom: number): Array<[number, number]> {
  if (routeWorldZoom !== zoom) {
    routeWorld = routeLatLng.map(([lat, lng]) => worldPixel(lat, lng, zoom));
    routeWorldZoom = zoom;
  }
  return routeWorld;
}

/** The route point nearest the wearer, searched a little ahead of the last one so loops don't jump back. */
function advanceRouteIndex(): void {
  if (!position || routeLatLng.length < 2) return;
  const zoom = travelZoom();
  const world = routeInWorld(zoom);
  const here = worldPixel(position.latitude, position.longitude, zoom);
  let best = routeIndex, bestDistance = Infinity;
  for (let i = Math.max(0, routeIndex - 5); i < Math.min(world.length, routeIndex + 120); i++) {
    const d = Math.hypot(world[i]![0] - here[0], world[i]![1] - here[1]);
    if (d < bestDistance) { bestDistance = d; best = i; }
  }
  routeIndex = best;
}


function streetMap(): StreetMap | null {
  const here = position ?? (lastFix ? { latitude: lastFix.latitude, longitude: lastFix.longitude } : null);
  if (!here) return null;
  const zoom = travelZoom();
  const center = worldPixel(here.latitude, here.longitude, zoom);
  const world = routeInWorld(zoom);
  const route = world.length >= 2 && !rerouting
    ? { behind: world.slice(Math.max(0, routeIndex - 60), routeIndex + 1).reverse(), ahead: world.slice(routeIndex + 1, routeIndex + 400) }
    : null;
  const facing = heading.output(Date.now());
  paintedHeading = facing;
  return {
    zoom,
    center,
    bearingDeg: facing.bearingDeg,
    showChevron: facing.showChevron,
    northUp: facing.source === "north",
    tile: (x, y) => tiles.tile(zoom, x, y),
    route,
    destination: world.length >= 2 ? world[world.length - 1]! : null,
    faint: rerouting,
  };
}

function guidanceView(): GuidanceView {
  if (phase === "arrived") return { kind: "arrived", name: target?.title ?? "", side: arrivedSide };
  if (phase === "starting") return { kind: "waiting", label: target ? "Buscando ruta" : "Buscando" };
  if (rerouting) return { kind: "rerouting" };
  const step: NavStep | undefined = lastNav?.step;
  if (!lastNav || !step) return { kind: "waiting", label: "Ubicándote" };
  const meters = Math.max(0, lastNav.stepMeters);
  return {
    kind: "guiding",
    maneuver: step.maneuver,
    roundabout: step.roundabout,
    meters,
    road: step.road || step.simpleRoad || step.instruction,
    near: meters <= NEAR_METERS,
  };
}

// ---------------------------------------------------------------------------
// Heading: glasses compass on foot, GPS course in a vehicle (heading-model.ts)

function resetHeading(): void {
  heading.reset(tripMode === "walking" ? "walking" : "vehicle");
  paintedHeading = null;
  compassHintUntilMs = 0;
  compassHintShown = false;
}

function reconcileCompass(): void {
  const visible = window !== null && window.foreground && screenOn && phase === "guiding";
  const wanted = visible && tripMode === "walking";
  if (wanted !== compassActive) {
    compassActive = wanted;
    if (wanted) {
      unsubscribeCompass = addCompassListener(handleCompassEvent);
      setCompassEnabled(true, COMPASS_OWNER);
    } else {
      setCompassEnabled(false, COMPASS_OWNER);
      unsubscribeCompass?.();
      unsubscribeCompass = null;
      heading.headLost(Date.now());
    }
  }
  if (visible && !headingTimer) headingTimer = setInterval(headingTick, HEADING_TICK_MS);
  else if (!visible && headingTimer) {
    clearInterval(headingTimer);
    headingTimer = null;
  }
}

function handleCompassEvent(event: CompassEvent): void {
  if (!compassActive) return;
  const now = Date.now();
  if (event.command === COMPASS_CALIBRATION_STARTED) {
    heading.headLost(now);
    return;
  }
  if (event.command !== COMPASS_CHANGED || event.headingDegrees < 0 || !position) return;
  const declination = magneticDeclinationDegrees(position.latitude, position.longitude);
  if (declination === null) return;
  heading.headSample(normalizeHeading(calibrateHeading(event.headingDegrees) + declination), compassQuality(event.diagnostics), now);
}

/** Expires stale sources and eases rotation even when no sensor event arrives. */
function headingTick(): void {
  const now = Date.now();
  const next = heading.output(now);
  if (next.compassPoor && !compassHintShown) {
    compassHintShown = true;
    compassHintUntilMs = now + COMPASS_HINT_MS;
  } else if (!next.compassPoor) {
    compassHintShown = false;
  }
  const previous = paintedHeading;
  const hintChanged = compassHintUntilMs > 0 && now >= compassHintUntilMs;
  if (hintChanged) compassHintUntilMs = 0;
  if (!previous || hintChanged || (next.compassPoor && compassHintUntilMs > now && !previous.compassPoor)
    || next.source !== previous.source || next.showChevron !== previous.showChevron
    || Math.abs(angleDelta(previous.bearingDeg, next.bearingDeg)) >= RENDER_STEP_DEG) {
    render();
  }
}

function compassHint(): string | null {
  return compassHintUntilMs > Date.now() ? COMPASS_HINT : null;
}

/** The phone's own GPS only feeds the idle list (distances, search bias); the SDK tracks trips. */
function reconcileTracking(): void {
  const wanted = window !== null && window.foreground && (phase === "idle" || phase === "search");
  if (wanted && !tracker.isRunning()) tracker.start(5_000);
  else if (!wanted && tracker.isRunning()) tracker.stop();
}

// ---------------------------------------------------------------------------
// Lists

function idleRows(): IdleRow[] {
  const rows: IdleRow[] = [{ kind: "search" }];
  for (const destination of loadSavedDestinations()) if (destination.address) rows.push({ kind: "saved", destination });
  for (const destination of loadRecentDestinations()) rows.push({ kind: "recent", destination });
  return rows;
}

function distanceLabel(destination: RecentDestination): string {
  if (!lastFix || destination.latitude === null || destination.longitude === null) return "";
  const [number, unit] = formatDistance(haversineMeters(lastFix.latitude, lastFix.longitude, destination.latitude, destination.longitude));
  return `${number} ${unit}`;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function idleTerminalRows(rows: IdleRow[]): TerminalRow[] {
  return rows.map((row) => {
    if (row.kind === "search") return { label: "Buscar un lugar" };
    if (row.kind === "saved") return { label: row.destination.name };
    return { label: row.destination.name, value: distanceLabel(row.destination) };
  });
}

function activateIdleRow(row: IdleRow): void {
  if (!getGoogleMapsKey()) {
    statusMessage = "Agrega la clave de Google Maps en el teléfono.";
    return;
  }
  if (row.kind === "search") beginSearch();
  else if (row.kind === "saved") navigateToSaved(row.destination);
  else {
    const recent = row.destination;
    startTrip({ placeId: recent.placeId, latitude: recent.latitude ?? 0, longitude: recent.longitude ?? 0, title: recent.name, detail: recent.place });
  }
}

function searchMessage(): string {
  if (searchState === "error") return searchError;
  if (!query) return "Escribe en el teléfono o di un lugar.";
  if (searchState === "searching" && !suggestions.length) return "Buscando…";
  if (!suggestions.length) return "Sin resultados.";
  return "";
}

// ---------------------------------------------------------------------------
// Input

function handleInput(win: NavWindow, event: InputEvent, frameId: number): void {
  if (win.menu?.isOpen()) {
    void win.menu
      .handleInput(event)
      .catch((error) => console.error(`navigate menu input failed: ${error}`))
      .then(() => renderAndSubmit(win, frameId));
    return;
  }
  if (editing) {
    if (event.type !== "click" && event.type !== "double-click") {
      frameTimings.finishFrame(frameId, "discarded: navigate edit ignored input");
      return;
    }
    finishEdit(event.type === "click");
    renderAndSubmit(win, frameId);
    return;
  }
  if (event.type === "short-then-long-press") {
    windowMenu(win).open();
    renderAndSubmit(win, frameId);
    return;
  }
  if (event.type === "double-click" && phase !== "search") {
    frameTimings.finishFrame(frameId, "discarded: navigate yielded focus");
    post({ type: "yield-focus", windowId: win.windowId });
    return;
  }
  if (!applyInput(event)) {
    frameTimings.finishFrame(frameId, "discarded: navigate ignored input");
    return;
  }
  renderAndSubmit(win, frameId);
}

/** Returns whether the event changed anything. */
function applyInput(event: InputEvent): boolean {
  const scroll = event.type === "scroll-down" ? 1 : event.type === "scroll-up" ? -1 : 0;
  switch (phase) {
    case "idle": {
      const rows = idleRows();
      if (scroll) {
        idleSelected = stepSelection(idleTerminalRows(rows), Math.min(idleSelected, rows.length - 1), scroll);
        return true;
      }
      const row = rows[Math.min(idleSelected, rows.length - 1)];
      if (event.type !== "click" || !row) return false;
      activateIdleRow(row);
      return true;
    }
    case "search":
      if (scroll && suggestions.length) {
        searchSelected = Math.max(0, Math.min(suggestions.length - 1, searchSelected + scroll));
      } else if (event.type === "click" && suggestions[searchSelected]) {
        pickSuggestion(suggestions[searchSelected]!);
      } else if (event.type === "double-click") {
        endSearch();
        phase = "idle";
        reconcileTracking();
      } else {
        return false;
      }
      return true;
    case "arrived":
      if (event.type !== "click") return false;
      stopTrip("");
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Window menu: stop, travel mode, display settings, saved and recent destinations

function windowMenuItems(): MenuItem[] {
  const items: MenuItem[] = [];
  if (phase === "starting" || phase === "guiding" || phase === "arrived") {
    items.push({
      label: "Detener navegación",
      onSelect: (ctx) => {
        ctx.stack.pop();
        stopTrip("");
        render();
      },
    });
  }
  items.push(
    enumSettingMenuItem(navigateTravelModeSetting),
    enumSettingMenuItem(navigateDisplayModeSetting),
    enumSettingMenuItem(navigateVerticalPositionSetting),
    submenuItem("Destinos guardados", (ctx) => {
      ctx.stack.push(new WindowMenuLayer("Destinos guardados", savedDestinationMenuItems()));
    }),
    {
      label: navigateRememberRecentSetting.label,
      onSelect: () => {
        if (!navigateRememberRecentSetting.toggle()) clearRecentDestinations();
      },
      render: ({ image, x, y, width, selected }) => {
        drawToggleMenuItem(image, smallFont, x, y, width, navigateRememberRecentSetting.label, navigateRememberRecentSetting.get(), selected);
      },
    },
  );
  const rows = phase === "idle" ? idleRows() : [];
  const selected = rows[Math.min(idleSelected, rows.length - 1)];
  if (selected?.kind === "recent") {
    const recent = selected.destination;
    items.push({
      label: `Olvidar ${truncateText(smallFont, recent.name, 160)}`,
      onSelect: (ctx) => {
        ctx.stack.pop();
        removeRecentDestination(recent);
      },
    });
  }
  if (loadRecentDestinations().length) {
    items.push({
      label: "Borrar recientes",
      onSelect: (ctx) => {
        ctx.stack.pop();
        clearRecentDestinations();
      },
    });
  }
  return items;
}

function savedDestinationMenuItems(): MenuItem[] {
  const saved = loadSavedDestinations();
  const items: MenuItem[] = [
    addressMenuItem("Casa", HOME_DESTINATION_ID, saved.find((d) => d.id === HOME_DESTINATION_ID)?.address ?? ""),
    addressMenuItem("Trabajo", WORK_DESTINATION_ID, saved.find((d) => d.id === WORK_DESTINATION_ID)?.address ?? ""),
  ];
  for (const dest of saved) {
    if (dest.builtin) continue;
    items.push({
      label: dest.name,
      onSelect: (ctx) => ctx.stack.push(new WindowMenuLayer(dest.name, customDestinationMenuItems(dest))),
      render: ({ image, x, y, width, height }) => {
        drawAddressRow(image, x, y, width, dest.name, dest.address, true);
        drawSubmenuIndicator(image, smallFont, x - 10, y, width + 20, height, 150);
      },
    });
  }
  items.push({ label: "Agregar destino…", onSelect: (ctx) => closeMenusAnd(ctx, () => beginAddDestination()) });
  return items;
}

function addressMenuItem(label: string, id: string, address: string): MenuItem {
  return {
    label,
    onSelect: (ctx) => closeMenusAnd(ctx, () => beginAddressEdit(id, label, address)),
    render: ({ image, x, y, width }) => drawAddressRow(image, x, y, width, label, address, false),
  };
}

function customDestinationMenuItems(dest: SavedDestination): MenuItem[] {
  return [
    {
      label: "Ir ahí",
      disabled: !dest.address,
      onSelect: (ctx) => closeMenusAnd(ctx, () => navigateToSaved(dest)),
    },
    { label: "Cambiar dirección", onSelect: (ctx) => closeMenusAnd(ctx, () => beginAddressEdit(dest.id, dest.name, dest.address)) },
    {
      label: "Renombrar",
      onSelect: (ctx) => closeMenusAnd(ctx, () => {
        navigateDestinationNameDraftSetting.set(dest.name);
        beginEdit(navigateDestinationNameDraftSetting, `Renombrar ${dest.name}`, (name) => {
          if (name) updateCustomDestination(dest.id, { name });
        });
      }),
    },
    { label: "Eliminar", onSelect: (ctx) => closeMenusAnd(ctx, () => removeCustomDestination(dest.id)) },
  ];
}

function drawAddressRow(image: GrayImage, x: number, y: number, width: number, label: string, address: string, hasSubmenu: boolean): void {
  const valueWidth = Math.max(40, width - smallFont.measureText(label) - (hasSubmenu ? 28 : 12));
  const value = truncateText(smallFont, address || "(sin dirección)", valueWidth);
  drawRightValueMenuItem(image, smallFont, x, y, width - (hasSubmenu ? 16 : 0), label, value);
}

function closeMenusAnd(ctx: LayerContext, action: () => void): void {
  ctx.stack.clearToBase();
  action();
}

function beginEdit(setting: ConfigSettingString, title: string, onDone: (value: string) => void): void {
  editing = { setting, title, onDone };
  post({ type: "start-text-setting-edit", settingId: setting.id });
  render();
}

function finishEdit(confirmed: boolean): void {
  const current = editing;
  editing = null;
  post({ type: "end-text-setting-edit" });
  if (current && confirmed) current.onDone(current.setting.get());
  if (!editing) {
    navigateDestinationNameDraftSetting.set("");
    navigateDestinationAddressDraftSetting.set("");
    render();
  }
}

function beginAddressEdit(id: string, name: string, current: string): void {
  navigateDestinationAddressDraftSetting.set(current);
  beginEdit(navigateDestinationAddressDraftSetting, `Dirección de ${name}`, (address) => {
    if (address) setDestinationAddress(id, address);
  });
}

function beginAddDestination(): void {
  navigateDestinationNameDraftSetting.set("");
  beginEdit(navigateDestinationNameDraftSetting, "Nombre del destino", (name) => {
    if (!name) return;
    navigateDestinationAddressDraftSetting.set("");
    beginEdit(navigateDestinationAddressDraftSetting, `Dirección de ${name}`, (address) => {
      if (address) addCustomDestination(name, address);
    });
  });
}

function windowMenu(win: NavWindow): WindowMenu {
  win.menu ??= new WindowMenu({
    windowId: win.windowId,
    post,
    title: () => win.title,
    items: () => windowMenuItems(),
    size: { width: win.viewportWidth, height: win.viewportHeight },
    paintBase: () => paintContent(win),
    isFocused: () => win.focused,
  });
  return win.menu;
}

// ---------------------------------------------------------------------------
// Painting

function fonts(): GuidanceFonts {
  const face = terminalFace();
  if (!guidanceFonts || guidanceFonts.face !== face) {
    const number = TtfFont.load(numberFontPath, 40);
    const unit = TtfFont.load(numberFontPath, 22);
    const tiny = TtfFont.load(numberFontPath, 12);
    if (!number || !unit || !tiny) throw new Error("Navigate fonts unavailable");
    guidanceFonts = { face, number, unit, tiny };
  }
  return guidanceFonts;
}

function paint(win: NavWindow): Plane[] {
  return windowMenu(win).paint();
}

function paintContent(win: NavWindow): GrayImage {
  const image = new GrayImage(win.viewportWidth, win.viewportHeight, 0);
  const f = fonts();
  if (editing) {
    paintTerminalList(image, f.face, {
      rows: [],
      selected: -1,
      message: editing.setting.get() || "Escribe en el teléfono.",
      footer: { left: `· ${editing.title}`, right: "" },
    });
    return image;
  }
  switch (phase) {
    case "idle": {
      const rows = idleRows();
      idleSelected = Math.min(idleSelected, rows.length - 1);
      const terminalRows = idleTerminalRows(rows);
      idleTop = listScrollTop(terminalRows.length, idleSelected, idleTop);
      const mode = navigateTravelModeSetting.displayValue();
      paintTerminalList(image, f.face, {
        rows: terminalRows,
        selected: idleSelected,
        message: getGoogleMapsKey() ? undefined : "Agrega la clave de Google Maps en el teléfono.",
        footer: { left: statusMessage ? `· ${statusMessage}` : "· Navegar", right: mode },
      }, idleTop);
      break;
    }
    case "search": {
      const rows: TerminalRow[] = suggestions.map((s) => ({ label: s.name, value: s.distanceMeters === null ? "" : formatDistance(s.distanceMeters).join(" ") }));
      searchTop = listScrollTop(rows.length, searchSelected, searchTop);
      const detail = suggestions[searchSelected]?.detail;
      paintTerminalList(image, f.face, {
        rows,
        selected: rows.length ? searchSelected : -1,
        message: searchMessage() || undefined,
        footer: { left: `· ${fitLine(f.face, detail || query || "Buscar", 330)}`, right: "Google Maps" },
      }, searchTop);
      break;
    }
    default:
      paintGuidance(image, f, guidanceView(), streetMap(), phase === "guiding" ? compassHint() : null);
      break;
  }
  return image;
}

function render(): void {
  if (window) renderAndSubmit(window, 0);
}

function renderAndSubmit(win: NavWindow, inputFrameId: number): void {
  reconcileCompass();
  if (!win.foreground && inputFrameId === 0) return;
  const frameId = inputFrameId > 0 ? inputFrameId : frameTimings.startFrame(`render:${win.windowId}`);
  try {
    const paintStartedAtMs = Date.now();
    const planes = frameTimings.span(frameId, "paint", () => frameTimings.runWithFrame(frameId, () => paint(win)));
    const paintMs = Date.now() - paintStartedAtMs;
    const fingerprint = planesFingerprint(planes);
    if (fingerprint === win.lastSubmittedFingerprint) {
      frameTimings.finishFrame(frameId, "discarded: navigate content unchanged");
      return;
    }
    const communicator = getActiveDisplay();
    if (!communicator) {
      frameTimings.finishFrame(frameId, "discarded: no active display");
      return;
    }
    const { image, draws } = frameTimings.span(frameId, "flatten", () => flattenPlanesWithDraws(planes));
    const buffer = frameTimings.span(frameId, "to8bpp", () => image.to8bppBuffer());
    communicator.submitSurfaceFrame(
      buffer.buffer,
      win.surfaceId,
      0,
      0,
      image.width,
      image.height,
      fingerprint,
      paintMs,
      frameId,
      frameTimings.span(frameId, "prepareFrameDraws", () => prepareFrameDraws(draws)),
    );
    win.lastSubmittedFingerprint = fingerprint;
  } catch (error) {
    frameTimings.finishFrame(frameId, "discarded: navigate render failed");
    console.error(`navigate worker render failed: ${error}`);
  }
}
