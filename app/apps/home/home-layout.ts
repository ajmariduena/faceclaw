import {
  appSwitcherPositionSetting,
  displayModeSetting,
  statusBarVisibilitySetting,
  windowBorderSetting,
} from "../../ui/dashboard-settings";

export function applyHomeLayout(): void {
  // Defaults alone do not replace the bottom bar already saved on the trial phone.
  if (appSwitcherPositionSetting.get() !== "popup") appSwitcherPositionSetting.set("popup");
  if (statusBarVisibilitySetting.get() !== "switcher") statusBarVisibilitySetting.set("switcher");
  if (windowBorderSetting.get()) windowBorderSetting.set(false);
  if (displayModeSetting.get() !== "576x288") displayModeSetting.set("576x288");
}
