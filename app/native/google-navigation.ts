/**
 * Google Navigation SDK bridge (FaceclawGoogleNav.kt). The worker calls
 * start/navigateTo/stop and gets JSON events on its own thread; the terms
 * dialog has to run on the main thread with an Activity (ensureNavigationTerms).
 */
import { Application, Utils } from "@nativescript/core";

declare const com: any;
declare const global: any;

export type NavStep = {
  maneuver: string;
  road: string;
  simpleRoad: string;
  instruction: string;
  /** Roundabout exit number, or -1. */
  roundabout: number;
};

export type NavEvent =
  | { type: "ready" }
  | { type: "error"; code: string }
  | { type: "status"; status: string }
  | { type: "route"; points: Array<[number, number]> }
  | {
      type: "nav";
      state: "ENROUTE" | "REROUTING" | "STOPPED" | "UNKNOWN";
      stepMeters: number;
      stepSeconds: number;
      destMeters: number;
      destSeconds: number;
      step?: NavStep;
      next?: NavStep;
    }
  | { type: "location"; lat: number; lng: number; bearing: number; speed: number }
  | { type: "arrived"; final: boolean }
  | { type: "rerouting" };

export type TravelMode = "driving" | "walking" | "two-wheeler";

export class GoogleNavigation {
  private listener: any = null;

  start(apiKey: string, onEvent: (event: NavEvent) => void): void {
    if (!global.isAndroid) {
      onEvent({ type: "error", code: "android-only" });
      return;
    }
    const context = Utils.android.getApplicationContext();
    this.listener = new com.faceclaw.app.FaceclawGoogleNavListener({
      onEvent: (json: string) => {
        try {
          onEvent(JSON.parse(String(json)) as NavEvent);
        } catch (error) {
          console.warn(`navigation event parse failed: ${error}`);
        }
      },
    });
    com.faceclaw.app.FaceclawGoogleNav.start(context, apiKey, this.listener);
  }

  navigateTo(target: { placeId: string; latitude: number; longitude: number; title: string }, mode: TravelMode): void {
    com.faceclaw.app.FaceclawGoogleNav.navigateTo(target.placeId, target.latitude, target.longitude, target.title, mode);
  }

  stop(): void {
    if (global.isAndroid) com.faceclaw.app.FaceclawGoogleNav.stop();
  }

  detach(): void {
    if (!this.listener) return;
    this.listener = null;
    com.faceclaw.app.FaceclawGoogleNav.detach();
  }
}

/** Shows Google's navigation terms once (main thread only); resolves whether they are accepted. */
export function ensureNavigationTerms(apiKey: string): Promise<boolean> {
  if (!global.isAndroid || !apiKey) return Promise.resolve(false);
  const activity = Application.android.foregroundActivity ?? Application.android.startActivity;
  if (!activity) return Promise.resolve(false);
  return new Promise((resolve) => {
    com.faceclaw.app.FaceclawGoogleNav.ensureTerms(activity, apiKey, new com.faceclaw.app.FaceclawBooleanResultListener({
      onResult: (accepted: boolean) => resolve(Boolean(accepted)),
      onError: (message: string) => {
        console.warn(`navigation terms: ${message}`);
        resolve(false);
      },
    }));
  });
}
