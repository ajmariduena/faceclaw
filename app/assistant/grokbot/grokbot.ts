import { fetchTextWithUserAgent } from "../../util/http";
import { getStringSetting, onSettingsStoreChanged, setStringSetting } from "../../native/settings-store";
import { cursorApiKeySetting, grokBotNamesSetting } from "../../ui/dashboard-settings";
import { GrokBotHub, parseBotNames } from "./grokbot-hub";
import type { GrokFetch } from "./grokbot-api";

const SESSIONS_KEY = "grokbot.sessions";
const REQUEST_TIMEOUT_MS = 20_000;

/** The native request has no timeout of its own; a hung poll would stall the hub forever. */
const fetchWithTimeout: GrokFetch = (url, init) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timed out")), REQUEST_TIMEOUT_MS);
  fetchTextWithUserAgent(url, init).then(response => { clearTimeout(timer); resolve(response); },
    (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); });
});

export const grokBotHub = new GrokBotHub({
  fetch: fetchWithTimeout,
  apiKey: () => cursorApiKeySetting.get(),
  botNames: () => parseBotNames(grokBotNamesSetting.get()).slice(0, 1),
  loadCache: () => getStringSetting(SESSIONS_KEY, ""),
  saveCache: value => setStringSetting(SESSIONS_KEY, value),
  log: message => console.log(message),
});

onSettingsStoreChanged(key => {
  if (key === "grokbot.cursorApiKey" || key === "grokbot.botNames") grokBotHub.configChanged();
});
