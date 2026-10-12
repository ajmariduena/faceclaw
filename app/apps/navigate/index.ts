import { ensureFineLocationPermission } from "../../native/location-permissions";
import { getGoogleMapsKey } from "../../native/google-maps";
import { ensureNavigationTerms } from "../../native/google-navigation";
import { launchWorkerAppWindow, type AppDefinition } from "../app-definition";

const navigateApp: AppDefinition = {
  appId: "navigate",
  title: "Navigate",
  icon: "map",
  launch: (ctx) => {
    // Navigation needs precise location; prompt on the phone while the
    // window opens (the worker can't show permission dialogs).
    // Google's navigation terms need an Activity, so they are shown here too.
    void ensureFineLocationPermission()
      .catch(() => {})
      .then(() => {
        const key = getGoogleMapsKey();
        if (key) return ensureNavigationTerms(key);
      })
      .catch(() => {});
    return launchWorkerAppWindow(ctx, {
      createWorker: () => new Worker("./navigate-app.worker"),
      windowId: "navigate:main",
      title: "Navigate",
      iconLetter: "N",
      icon: "map",
    });
  },
};

export default navigateApp;
