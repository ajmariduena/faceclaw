import { getCurrentLocation } from "../../native/location";
import { hasLocationPermission } from "../../native/location-permissions";
import { getStringSetting, setStringSetting } from "../../native/settings-store";
import { fetchTextWithUserAgent } from "../../util/http";
import { HomeWeather } from "./home-weather";

/** Open-Meteo for the phone's location, cached in settings; shared by the home card and Instant. */
export function createHomeWeather(): HomeWeather {
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
