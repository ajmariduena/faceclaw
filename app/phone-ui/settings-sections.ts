import { Frame } from "@nativescript/core";
import type { DashboardSnapshot } from "../g2/dashboard-controller";
import { loadDeviceAddresses, loadPairedGlassesIdentity } from "../g2/device-addresses";
import { GlassesHardwareIdentity } from "../g2/glasses-hardware-identity";
import { wearBridge } from "../native/wear-bridge";
import { shell } from "../ui/shell/shell";
import * as s from "../ui/dashboard-settings";
import { FACECLAW_VERSION } from "../version";
import { openFlashPage, openFontsCheck, openPairing } from "./device-actions";
import { PermissionsViewModel } from "./permissions-view-model";
import { enumRow, group, infoRow, linkRow, pickEnum, row, textRow, toggleRow, type SettingGroup } from "./settings-rows";

export type SectionId = "display" | "controls" | "voice" | "device" | "about";

export type SectionContext = {
  snapshot: () => DashboardSnapshot | null;
};

export const SECTION_TITLES: Record<SectionId, string> = {
  display: "Display",
  controls: "Controls",
  voice: "Voice & bots",
  device: "Device",
  about: "About",
};

export function buildSection(id: SectionId, ctx: SectionContext): SettingGroup[] {
  switch (id) {
    case "display":
      return displaySection();
    case "controls":
      return controlsSection();
    case "voice":
      return voiceSection();
    case "device":
      return deviceSection(ctx);
    case "about":
      return aboutSection();
  }
}

function navigate(moduleName: string, context?: object): void {
  Frame.topmost()?.navigate({ moduleName, context });
}

let lastManualBrightness = 50;

function brightnessLevel(): number {
  const value = s.brightnessSetting.get();
  if (value === "auto") return lastManualBrightness;
  const numeric = parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : 50;
}

function displaySection(): SettingGroup[] {
  const bottomOrPopup = () => ["bottom", "popup"].includes(s.appSwitcherPositionSetting.get());
  return [
    group("", [
      row({
        label: "Auto brightness",
        checked: () => s.brightnessSetting.get() === "auto",
        onCheckedChange: (on) => {
          if (on) {
            lastManualBrightness = brightnessLevel();
            s.brightnessSetting.set("auto");
          } else {
            s.brightnessSetting.set(String(lastManualBrightness) as s.BrightnessSetting);
          }
        },
      }),
      row({
        label: "Brightness",
        slider: {
          min: 2,
          max: 100,
          value: brightnessLevel,
          enabled: () => s.brightnessSetting.get() !== "auto",
          onChange: (raw) => {
            // The setting only has every tenth level; snap to the nearest.
            const level = Math.min(100, Math.max(2, Math.round(raw / 10) * 10));
            lastManualBrightness = level;
            const value = String(level) as s.BrightnessSetting;
            if (s.brightnessSetting.get() !== value) s.brightnessSetting.set(value);
          },
        },
      }),
      row({
        label: s.screenTimeoutSetting.label,
        value: () => s.screenTimeoutSetting.displayValue(),
        onTap: async () => {
          const before = s.screenTimeoutSetting.get();
          await pickEnum(s.screenTimeoutSetting, s.screenTimeoutSetting.label);
          if (s.screenTimeoutSetting.get() !== before) shell.noteUserActivity();
        },
      }),
      toggleRow(s.lockScreenEnabledSetting, "Lock screen"),
    ]),
    group("Window", [
      row({
        label: "Size",
        segments: {
          labels: s.DISPLAY_MODE_VALUES.map((value) => s.displayModeLabel(value).split(" · ")[0] ?? value),
          selected: () => s.DISPLAY_MODE_VALUES.indexOf(s.displayModeSetting.get()),
          onSelect: (index) => {
            const value = s.DISPLAY_MODE_VALUES[index];
            if (value && value !== s.displayModeSetting.get()) s.displayModeSetting.set(value);
          },
        },
      }),
      enumRow(s.verticalPositionSetting),
      enumRow(s.uiDepthSetting, s.uiDepthSetting.label, bottomOrPopup),
      enumRow(s.textSizeSetting),
      enumRow(s.appSwitcherPositionSetting, "App switcher"),
      enumRow(s.statusBarVisibilitySetting, s.statusBarVisibilitySetting.label, () => s.appSwitcherPositionSetting.get() === "popup"),
      toggleRow(s.windowBorderSetting),
    ]),
    group("Status bar", [
      enumRow(s.statusBarPositionSetting, "Position", bottomOrPopup),
      enumRow(s.batteryDisplayModeSetting, "Battery indicators"),
      enumRow(s.timeFormatSetting),
    ]),
    group("Battery indicators", [
      enumRow(s.phoneBatteryVisibilitySetting),
      enumRow(s.watchBatteryVisibilitySetting),
      enumRow(s.glassesBatteryVisibilitySetting),
      enumRow(s.ringBatteryVisibilitySetting),
    ]),
    group("Motion", [
      enumRow(s.menuAnimationSetting),
      enumRow(s.screenFadeSetting),
    ]),
  ];
}

function batteryText(percent: number | null): string {
  return percent !== null && Number.isFinite(percent) ? `${Math.round(percent)}%` : "";
}

function controlsSection(): SettingGroup[] {
  const watchStatus = (): string => {
    if (!wearBridge.isAvailable()) return "Google Play services unavailable";
    const connection = wearBridge.getWatchConnection();
    if (!connection.reachable) return "Not connected";
    return ["Connected", batteryText(shell.getBatteryLevels().watch)].filter(Boolean).join(" · ");
  };
  const watchName = (): string => {
    const connection = wearBridge.isAvailable() ? wearBridge.getWatchConnection() : null;
    return connection?.reachable && connection.watchName ? connection.watchName : "Watch";
  };
  const ringStatus = (): string => {
    const level = shell.getBatteryLevels().ring;
    return level !== null ? ["Connected", batteryText(level)].filter(Boolean).join(" · ") : "Not connected";
  };
  return [
    group("Watch", [
      row({ label: watchName, sublabel: watchStatus }),
      toggleRow(s.watchRemoteEnabledSetting, "Remote control from the watch"),
      toggleRow(s.watchCanUnlockSetting),
      toggleRow(s.watchCrownClockwiseNextSetting),
      toggleRow(s.watchMirrorAssistantSetting),
    ]),
    group("Ring", [
      row({ label: "Even R1", sublabel: ringStatus }),
      enumRow(s.ringConnectionModeSetting, "Connection"),
    ]),
    group("Phone", [
      toggleRow(s.mirrorTouchSetting),
      linkRow("Touchpad", () => navigate("phone-ui/touchpad-page")),
      enumRow(s.phoneRotationSetting),
      enumRow(s.previewColorSetting),
    ]),
  ];
}

function voiceSection(): SettingGroup[] {
  return [
    group("Voice", [
      enumRow(s.voiceProviderSetting, "Transcription"),
      enumRow(s.wakeWordActionSetting, "\u201CHey Even\u201D"),
      toggleRow(s.saveVoiceRecordingsSetting),
    ]),
    group("Grok Bot", [
      textRow(s.grokBotNamesSetting),
      toggleRow(s.botsWakeOnReplySetting),
    ]),
  ];
}

function deviceSection(ctx: SectionContext): SettingGroup[] {
  const phase = () => ctx.snapshot()?.phase ?? "disconnected";
  const permissions = new PermissionsViewModel();
  const glassesSummary = (): string => {
    const identity = loadPairedGlassesIdentity();
    if (!identity) return "Not paired";
    const decoded = GlassesHardwareIdentity.decode(identity.serial);
    return decoded?.variantSummary ?? decoded?.productName ?? identity.serial;
  };
  const ringSummary = (): string => {
    const identity = loadPairedGlassesIdentity();
    return identity?.ringName || loadDeviceAddresses().ring || "Not paired";
  };
  return [
    group("Pairing", [
      linkRow("Glasses", () => openPairing(phase()), undefined, glassesSummary),
      infoRow("Ring", ringSummary),
    ]),
    group("Firmware", [
      linkRow("Install custom firmware", () => openFlashPage("install", phase())),
      linkRow("Uninstall custom firmware", () => openFlashPage("uninstall", phase())),
      row({
        label: "G2 fonts",
        value: () => (ctx.snapshot()?.fontsMissingWarningVisible ? "Missing" : "Ready"),
        onTap: () => (ctx.snapshot()?.fontsMissingWarningVisible ? openFontsCheck(phase()) : undefined),
      }),
    ]),
    group("Permissions", permissions.cards.map((card) =>
      linkRow(card.title, () => navigate("phone-ui/permissions-page", { onboarding: false }), () => {
        // Grants happen on system screens, so re-check on every refresh.
        permissions.refresh();
        const current = permissions.cards.find((candidate) => candidate.id === card.id);
        return current?.checkVisibility === "visible" ? "Granted" : "Not granted";
      }),
    )),
    group("Developer", [
      toggleRow(s.showBleBandwidthSetting),
      toggleRow(s.suspendEvenHubWhenScreenOffSetting),
      toggleRow(s.firmwareDebugFlagsSetting),
      toggleRow(s.useMicControlSetting),
      toggleRow(s.developerInMoreSetting),
    ]),
  ];
}

function aboutSection(): SettingGroup[] {
  const doc = (fileName: string, title: string) =>
    linkRow(title, () => navigate("phone-ui/document-page", { fileName, title }));
  return [
    group("", [infoRow("Version", () => FACECLAW_VERSION)]),
    group("", [
      doc("README.md", "README"),
      doc("LICENSE", "License"),
      doc("PRIVACY", "Privacy policy"),
      doc("ACKNOWLEDGEMENTS.md", "Acknowledgements"),
    ]),
  ];
}
