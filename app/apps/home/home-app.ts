import { knownFolders } from "@nativescript/core";
import { TtfFont } from "../../graphics/ttf-font";
import { EvenHubFont } from "../../graphics/evenhub-font";
import { getDefaultSmallFont, getDefaultLargeFont } from "../../graphics/ui-fonts";
import { readUpcomingEvents, getCalendarReadState, onCalendarChanged } from "../../native/calendar";
import { hasCalendarPermission } from "../../native/calendar-permissions";
import { mediaControllerBridge } from "../../native/media-controller";
import { ALL_NOTIFICATIONS, onAndroidNotificationPosted, readActiveNotifications } from "../../native/notification-icons";
import { shouldShowNotificationOnGlasses } from "../../native/notification-sources";
import type { InputEvent } from "../../ui/gestures";
import type { Layer } from "../../ui/layers";
import { createInProcessWindow } from "../../ui/shell/in-process-window";
import { shell } from "../../ui/shell/shell";
import { onWorkerStateChanged, readWorkerState } from "../../ui/shell/worker-state";
import { PASEO_GLANCE_STATE_KEY, type PaseoGlanceSnapshot } from "../paseo/paseo-glance";
import type { AppContext } from "../app-definition";
import { HomeModel, HOME_WINDOW_ID, HOME_SURFACE_ID, calendarCardState } from "./home-model";
import { paintHome, type HomeFace } from "./home-painter";

function homeFace(): HomeFace {
  try {
    const stock = EvenHubFont.get();
    if (stock.hasGlyph(65)) return stock;
  } catch (error) {
    console.warn("Home font unavailable", error);
  }
  const font = getDefaultSmallFont();
  return {
    lineHeight: font.lineHeight,
    measureLine: text => font.measureText(text),
    drawText: (image, x, y, text, value) => font.drawText(image, x, y, text, value),
  };
}

function homeClockFace(): HomeFace {
  const path = knownFolders.currentApp().getFile("fonts/ttf/Roboto-Light.ttf").path;
  const font = TtfFont.load(path, 80) ?? getDefaultLargeFont();
  return {
    lineHeight: font.lineHeight,
    measureLine: text => font.measureText(text),
    drawText: (image, x, y, text, value = 255) => font.drawText(image, x, y, text, value),
  };
}

export function createHomeWindow(ctx: AppContext) {
  const model = new HomeModel();
  let foreground = false;
  let screenOn = shell.isScreenOn();
  let tick: ReturnType<typeof setInterval> | null = null;
  let unsubscribers: (() => void)[] = [];
  let launching = false;
  const requestRender = () => { if (foreground && screenOn) app.requestRender(); };
  const launch = async () => {
    if (launching) return;
    launching = true;
    try { await ctx.launchApp(model.open()); }
    catch (error) { model.returnHome(); throw error; }
    finally { launching = false; }
  };
  const layer: Layer = {
    acceptsDirectional: true,
    paint: () => {
      const now = new Date();
      const permitted = hasCalendarPermission();
      const media = mediaControllerBridge.snapshot();
      const notifications = readActiveNotifications(ALL_NOTIFICATIONS)
        .filter(item => shouldShowNotificationOnGlasses(item.packageName))
        .sort((a, b) => b.postTime - a.postTime);
      return paintHome(model.selectedIndex, {
        now,
        calendar: calendarCardState(permitted, permitted ? readUpcomingEvents() : [], now.getTime(), getCalendarReadState()),
        music: media.available && (media.title || media.artist)
          ? { title: media.title, artist: media.artist, playing: media.playbackState === "playing" } : null,
        notifications,
        paseo: (readWorkerState(PASEO_GLANCE_STATE_KEY) as PaseoGlanceSnapshot | undefined) ?? null,
      }, homeFace(), homeClockFace());
    },
    handleInput: async (event: InputEvent) => {
      if (launching) return;
      if (event.type === "scroll-up" || event.type === "swipe-up" || event.type === "swipe-right") model.move(-1);
      else if (event.type === "scroll-down" || event.type === "swipe-down" || event.type === "swipe-left") model.move(1);
      else if (event.type === "click") await launch();
    },
    hitTest: async (x, y) => {
      if (x >= 230 && x < 548 && y >= 14 && y < 274) await launch();
      return true;
    },
  };
  function updateSubscriptions() {
    if (foreground && screenOn) {
      if (tick !== null) return;
      tick = setInterval(requestRender, 30_000);
      unsubscribers = [
        onCalendarChanged(requestRender),
        mediaControllerBridge.onStateChange(requestRender),
        onAndroidNotificationPosted(requestRender),
        onWorkerStateChanged(PASEO_GLANCE_STATE_KEY, requestRender),
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
    title: "Inicio",
    iconLetter: "I",
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
  return { window: app.window, onShow: (waking: boolean) => { if (waking) model.wake(); else model.returnHome(); } };
}
