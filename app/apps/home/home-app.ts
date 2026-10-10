import { readUpcomingEvents, getCalendarReadState, onCalendarChanged } from "../../native/calendar";
import { hasCalendarPermission } from "../../native/calendar-permissions";
import { getCurrentLocation } from "../../native/location";
import { hasLocationPermission } from "../../native/location-permissions";
import { getStringSetting, setStringSetting } from "../../native/settings-store";
import { onAnySettingChanged, sonioxApiKeySetting } from "../../ui/dashboard-settings";
import type { InputEvent } from "../../ui/gestures";
import type { Layer } from "../../ui/layers";
import { createInProcessWindow } from "../../ui/shell/in-process-window";
import { shell } from "../../ui/shell/shell";
import { onWorkerStateChanged, readWorkerState } from "../../ui/shell/worker-state";
import { PASEO_GLANCE_STATE_KEY, type PaseoGlanceSnapshot } from "../paseo/paseo-glance";
import type { AppContext } from "../app-definition";
import { fetchTextWithUserAgent } from "../../util/http";
import { HomeModel, HOME_WINDOW_ID, HOME_SURFACE_ID, HOME_SLEEP_GUARD_MS, calendarCardState } from "./home-model";
import { paintHome } from "./home-painter";
import { HomeWeather } from "./home-weather";
import { stockFace } from "../../ui/stock-face";

function createHomeWeather(): HomeWeather {
  return new HomeWeather({
    permitted: hasLocationPermission,
    locate: getCurrentLocation,
    fetchJson: async url => {
      const response = await fetchTextWithUserAgent(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    read: getStringSetting,
    write: setStringSetting,
    now: Date.now,
  });
}

export function createHomeWindow(ctx: AppContext) {
  const model = new HomeModel();
  const weather = createHomeWeather();
  let foreground = false;
  let screenOn = shell.isScreenOn();
  let tick: ReturnType<typeof setInterval> | null = null;
  let unsubscribers: (() => void)[] = [];
  let launching = false;
  let shownAtMs = 0;
  const requestRender = () => { if (foreground && screenOn) app.requestRender(); };
  const launch = async () => {
    if (launching) return;
    launching = true;
    try {
      await ctx.launchApp(model.open());
      // An app the build lacks (the controller logs "unknown app") leaves the home showing.
      if (shell.foregroundWindow()?.windowId === HOME_WINDOW_ID) model.returnHome();
    }
    catch (error) { model.returnHome(); throw error; }
    finally { launching = false; }
  };
  const layer: Layer = {
    acceptsDirectional: true,
    paint: () => {
      const now = new Date();
      const permitted = hasCalendarPermission();
      const levels = shell.getBatteryLevels();
      return paintHome(model.selectedIndex, {
        now,
        calendar: calendarCardState(permitted, permitted ? readUpcomingEvents() : [], now.getTime(), getCalendarReadState()),
        paseo: (readWorkerState(PASEO_GLANCE_STATE_KEY) as PaseoGlanceSnapshot | undefined) ?? null,
        translateReady: sonioxApiKeySetting.get().trim().length > 0,
        battery: { ring: levels.ring, glasses: levels.headset },
        weather: weather.reading(),
      }, stockFace());
    },
    handleInput: async (event: InputEvent) => {
      if (launching) return;
      if (event.type === "scroll-up" || event.type === "swipe-up" || event.type === "swipe-right") model.move(-1);
      else if (event.type === "scroll-down" || event.type === "swipe-down" || event.type === "swipe-left") model.move(1);
      else if (event.type === "click") await launch();
      else if (event.type === "double-click" && Date.now() - shownAtMs >= HOME_SLEEP_GUARD_MS) shell.sleep();
    },
    hitTest: async (x, y) => {
      if (x >= 230 && x < 548 && y >= 14 && y < 274) await launch();
      return true;
    },
  };
  function updateSubscriptions() {
    if (foreground && screenOn) {
      if (tick !== null) return;
      weather.refresh();
      tick = setInterval(() => { weather.refresh(); requestRender(); }, 30_000);
      unsubscribers = [
        onCalendarChanged(requestRender),
        onWorkerStateChanged(PASEO_GLANCE_STATE_KEY, requestRender),
        onAnySettingChanged(requestRender),
        shell.onBatteryLevelsChanged(requestRender),
        weather.onChange(requestRender),
      ];
    } else {
      if (tick !== null) clearInterval(tick);
      tick = null;
      for (const off of unsubscribers) off();
      unsubscribers = [];
    }
  }
  const app = createInProcessWindow({
    appId: HOME_WINDOW_ID,
    windowId: HOME_WINDOW_ID,
    title: "Home",
    iconLetter: "H",
    icon: "layout-grid",
    closeable: false,
    actions: { ...ctx.actions, requestRender },
    baseLayer: layer,
    submitFrame: (planes, paintMs, frameId) => ctx.submitWindowFrame(HOME_SURFACE_ID, planes, paintMs, frameId),
    setSurfaceVisible: visible => ctx.setWindowSurfaceVisible(HOME_SURFACE_ID, visible),
    onForegroundChanged: visible => { foreground = visible; updateSubscriptions(); },
    setScreenOn: on => { screenOn = on; updateSubscriptions(); },
    onClosed: () => { foreground = false; updateSubscriptions(); },
  });
  return {
    window: app.window,
    onShow: (waking: boolean) => {
      shownAtMs = Date.now();
      if (waking) model.wake(); else model.returnHome();
    },
  };
}
