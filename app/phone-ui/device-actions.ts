import { Frame } from "@nativescript/core";
import { dashboardController, type DashboardSnapshot } from "../g2/dashboard-controller";
import { resumeAutoReconnect } from "../g2/reconnect-policy";
import { isPreviewOnlyMode } from "./onboarding-state";

type Phase = DashboardSnapshot["phase"];

function isLinked(phase: Phase): boolean {
  return phase === "connected" || phase === "charging" || phase === "connecting";
}

/**
 * Live scan that names each nearby pair by model, colour, and serial and
 * checks both arms belong together. A connected arm stops advertising, so
 * drop the current link first. disconnect() enters the manual-disconnected
 * state; pairing is a detour, not a Disconnect, so lift the suppression
 * right away — nothing dials the glasses until the main page's autoConnect
 * runs again on the way back.
 *
 * In preview-only mode there are no glasses yet, so pairing is really the
 * rest of onboarding: re-enter that chain at its "Disconnect Other Apps"
 * step, which leads to the scan, the firmware check, and flashing. The
 * chain's Back buttons pop history, so its first page returns here.
 */
export async function openPairing(phase: Phase): Promise<void> {
  if (isPreviewOnlyMode()) {
    Frame.topmost()?.navigate({ moduleName: "phone-ui/onboarding-unpair-page" });
    return;
  }
  if (isLinked(phase)) {
    try {
      await dashboardController.disconnect();
    } catch {
      // proceed anyway; the pairing page reports what it hears
    }
    resumeAutoReconnect();
  }
  Frame.topmost()?.navigate({ moduleName: "phone-ui/pairing-page", context: { onboarding: false } });
}

/** The flasher needs the glasses to itself, so drop the main connection first. */
export async function openFlashPage(mode: "install" | "uninstall", phase: Phase): Promise<void> {
  if (phase === "connected" || phase === "charging") {
    try {
      await dashboardController.disconnect();
    } catch {
      // proceed anyway; the flash page surfaces any connection trouble
    }
  }
  Frame.topmost()?.navigate({
    moduleName: "phone-ui/onboarding-flash-page",
    context: { mode, fromOnboarding: false },
  });
}

/**
 * Jump back into the onboarding firmware check, whose missing-fonts path
 * downloads the stock firmware and extracts the G2 fonts without reflashing.
 * The check probes the glasses itself, so drop the main connection first;
 * like pairing, this is a detour rather than a Disconnect, so lift the
 * auto-reconnect suppression right away.
 */
export async function openFontsCheck(phase: Phase): Promise<void> {
  if (isLinked(phase)) {
    try {
      await dashboardController.disconnect();
    } catch {
      // proceed anyway; the firmware check reports its own connection trouble
    }
    resumeAutoReconnect();
  }
  Frame.topmost()?.navigate({ moduleName: "phone-ui/onboarding-firmware-check-page" });
}
