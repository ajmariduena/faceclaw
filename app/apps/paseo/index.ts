import { launchWorkerAppWindow, type AppDefinition } from "../app-definition";
import { onSettingsStoreChanged } from "../../native/settings-store";
import { hasPaseoBackgroundWork, PASEO_PAIRING_KEY } from "./paseo-store";

/** The one place the worker is constructed (string-literal path for the webpack worker loader). */
const createWorker = () => new Worker("./paseo-app.worker");

let stopWatchingSettings: (() => void) | null = null;

const paseoApp: AppDefinition = {
  appId: "paseo",
  title: "Paseo",
  icon: "activity",
  launch: (ctx) =>
    launchWorkerAppWindow(ctx, {
      createWorker,
      windowId: "paseo:main",
      title: "Paseo",
      iconLetter: "P",
      icon: "activity",
    }),
  /**
   * The home's Paseo card shows what this app's worker knows, so start the
   * worker (windowless) whenever a daemon is paired: at startup and when the
   * pairing changes. The worker reports idle by itself once nothing needs it.
   */
  boot: (ctx) => {
    const ensureWorker = () => {
      if (hasPaseoBackgroundWork()) ctx.ensureWorkerHost(createWorker);
    };
    ensureWorker();
    stopWatchingSettings?.();
    stopWatchingSettings = onSettingsStoreChanged((key) => {
      if (key === PASEO_PAIRING_KEY) ensureWorker();
    });
  },
};

export default paseoApp;
