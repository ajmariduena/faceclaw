import { apiStatusKey, resetApiStatus } from "../../ui/api-key-status";
import { getStringSetting, setStringSetting } from "../../native/settings-store";
import { deserializePairing, serializePairing, type PaseoPairing } from "./paseo-pairing";

/**
 * The stored pairing (one daemon), as JSON under one settings key. For a
 * relay pairing it holds the daemon's public key, which is the credential:
 * never shown on screen or logged.
 */
export const PASEO_PAIRING_KEY = "paseo.pairing";

export function loadPairing(): PaseoPairing | null {
  return deserializePairing(getStringSetting(PASEO_PAIRING_KEY, ""));
}

export function savePairing(pairing: PaseoPairing | null): void {
  const encoded = serializePairing(pairing);
  if (getStringSetting(PASEO_PAIRING_KEY, "") !== encoded) setStringSetting(apiStatusKey("paseo"), JSON.stringify(resetApiStatus(Boolean(pairing))));
  setStringSetting(PASEO_PAIRING_KEY, encoded);
}

/**
 * The home's Paseo card shows what the worker knows, so the worker runs
 * (windowless) whenever a daemon is paired. The app's boot hook spawns it;
 * the worker reports idle once nothing is paired and no window is open.
 */
export function hasPaseoBackgroundWork(): boolean {
  return loadPairing() !== null;
}
