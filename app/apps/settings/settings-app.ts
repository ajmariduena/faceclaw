import { type Plane } from "../../graphics/plane";
import { LayerActions } from "../../ui/layers";
import { onAnySettingChanged } from "../../ui/dashboard-settings";
import { createInProcessWindow, type InProcessWindow } from "../../ui/shell/in-process-window";
import { shell, type ShellWindow } from "../../ui/shell/shell";
import { onWorkerStateChanged } from "../../ui/shell/worker-state";
import { PASEO_GLANCE_STATE_KEY } from "../paseo/paseo-glance";
import { StatusLayer } from "./status-layer";

export const SETTINGS_WINDOW_ID = "settings";
export const SETTINGS_SURFACE_ID = "window:settings";

export type SettingsAppOptions = {
  actions: LayerActions;
  submitFrame: (planes: Plane[], paintMs: number, frameId: number) => Promise<void>;
  setSurfaceVisible: (visible: boolean) => void;
  removeSurface: () => void;
  onClosed: () => void;
};

export type SettingsAppWindow = {
  window: ShellWindow;
  /** The full in-process window record, for hosts that manage window lifecycle. */
  inProcess: InProcessWindow;
  requestRender: () => void;
  /** Select a section in the left column by label (e.g. "Voice"). */
  focusSection: (label: string) => void;
  /** Whether the glasses-side text-setting editor is the top layer. */
  isTextEditorOnTop: () => boolean;
  /** Pop the text-setting editor if it is on top; returns whether it was. */
  closeTextEditor: () => boolean;
};

/**
 * The glasses Settings app, reduced to status: batteries, the Paseo link,
 * the service keys as the phone last tested them, brightness and Disconnect.
 * Everything else is set on the phone (the settings menu tree in
 * app/ui/dashboard/settings-menus.ts stays for that host). The section and
 * text-editor hooks are kept for the controller's deep links; they are no-ops
 * here.
 */
export function createSettingsAppWindow(options: SettingsAppOptions): SettingsAppWindow {
  const layer = new StatusLayer();
  let unsubscribers: (() => void)[] = [];
  const inProcess = createInProcessWindow({
    appId: "settings",
    windowId: SETTINGS_WINDOW_ID,
    title: "Settings",
    iconLetter: "Se",
    icon: "settings",
    closeable: true,
    actions: options.actions,
    baseLayer: layer,
    submitFrame: options.submitFrame,
    setSurfaceVisible: options.setSurfaceVisible,
    removeSurface: options.removeSurface,
    onClosed: () => {
      for (const off of unsubscribers) off();
      unsubscribers = [];
      options.onClosed();
    },
  });
  const { window, requestRender } = inProcess;
  const visible = () => shell.isWindowVisible(SETTINGS_WINDOW_ID);
  const refresh = () => { if (visible()) requestRender(); };
  unsubscribers = [
    shell.onBatteryLevelsChanged(refresh),
    onWorkerStateChanged(PASEO_GLANCE_STATE_KEY, refresh),
    onAnySettingChanged(refresh),
  ];
  return {
    window,
    inProcess,
    requestRender,
    focusSection: () => {},
    isTextEditorOnTop: () => false,
    closeTextEditor: () => false,
  };
}
