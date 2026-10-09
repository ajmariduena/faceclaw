/**
 * Paseo pairing links: `https://app.paseo.sh/#offer=<base64url JSON>` with
 * `{ v: 2, serverId, daemonPublicKeyB64, relay: { endpoint, useTls } }`
 * (the daemon's `paseo daemon pair` output). The public key is the only
 * credential; it is stored on the phone and never shown on screen.
 *
 * Hand-typed `ws://host:6767/ws` (or `host:port`) is accepted as a direct
 * connection for a daemon that listens on the network.
 *
 * No NativeScript or URL/URLSearchParams use (unreliable in the runtime).
 */

export type RelayPairing = {
  kind: "relay";
  serverId: string;
  daemonPublicKeyB64: string;
  relay: { endpoint: string; useTls: boolean };
};

export type DirectPairing = {
  kind: "direct";
  /** ws:// or wss:// URL ending in /ws. */
  url: string;
};

export type PaseoPairing = RelayPairing | DirectPairing;

export type PairingParseResult = { ok: true; pairing: PaseoPairing } | { ok: false; error: string };

const NOT_A_LINK = "Paste the pairing link from \"paseo daemon pair\" (it looks like https://app.paseo.sh/#offer=...).";

function base64UrlDecode(text: string): string | null {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of padded) {
    if (char === "=") break;
    const index = alphabet.indexOf(char);
    if (index < 0) return null;
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(bytes.map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join(""));
  } catch {
    return null;
  }
}

function parseOffer(encoded: string): PairingParseResult {
  const json = base64UrlDecode(encoded);
  if (!json) return { ok: false, error: "That link's offer is not readable." };
  let offer: any;
  try {
    offer = JSON.parse(json);
  } catch {
    return { ok: false, error: "That link's offer is not valid JSON." };
  }
  if (!offer || typeof offer !== "object") return { ok: false, error: "That link's offer is empty." };
  if (offer.v !== 2) return { ok: false, error: `Unsupported pairing offer version (${String(offer.v)}); update Faceclaw or Paseo.` };
  const serverId = typeof offer.serverId === "string" ? offer.serverId.trim() : "";
  const key = typeof offer.daemonPublicKeyB64 === "string" ? offer.daemonPublicKeyB64.trim() : "";
  const endpoint = typeof offer.relay?.endpoint === "string" ? offer.relay.endpoint.trim() : "";
  if (!serverId || !key || !endpoint) return { ok: false, error: "That link's offer is missing the server id, key or relay." };
  const useTls = typeof offer.relay.useTls === "boolean" ? offer.relay.useTls : /:443$/.test(endpoint);
  return { ok: true, pairing: { kind: "relay", serverId, daemonPublicKeyB64: key, relay: { endpoint, useTls } } };
}

export function parsePairingInput(input: string): PairingParseResult {
  const text = input.trim();
  if (!text) return { ok: false, error: NOT_A_LINK };
  const offer = /#offer=(\S+)/.exec(text);
  if (offer) return parseOffer(offer[1]!);
  const direct = /^(wss?:\/\/)?([^/\s?#]+)(\/ws\/?)?$/i.exec(text);
  if (direct && /^[\w.\-]+(:\d+)?$|^\[[^\]]+\](:\d+)?$/.test(direct[2]!)) {
    const scheme = (direct[1] ?? "ws://").toLowerCase();
    const hasPort = /:\d+$/.test(direct[2]!);
    // A bare host means the daemon's default port; TLS hosts sit behind a proxy on 443.
    const host = hasPort || scheme === "wss://" ? direct[2]! : `${direct[2]}:6767`;
    return { ok: true, pairing: { kind: "direct", url: `${scheme}${host}/ws` } };
  }
  return { ok: false, error: NOT_A_LINK };
}

/** The relay client socket URL for a pairing (mirrors @getpaseo/protocol buildRelayWebSocketUrl). */
export function relaySocketUrl(pairing: RelayPairing): string {
  const scheme = pairing.relay.useTls ? "wss" : "ws";
  const endpoint = pairing.relay.endpoint.replace(/\/+$/, "");
  return `${scheme}://${endpoint}/ws?serverId=${encodeURIComponent(pairing.serverId)}&role=client&v=2`;
}

/** Where the pairing points, for display (never the key). */
export function pairingLabel(pairing: PaseoPairing): string {
  if (pairing.kind === "direct") return pairing.url.replace(/^wss?:\/\//, "").replace(/\/ws\/?$/, "");
  return `relay ${pairing.relay.endpoint.replace(/:443$/, "")} · ${pairing.serverId.slice(0, 8)}`;
}

export function serializePairing(pairing: PaseoPairing | null): string {
  return pairing ? JSON.stringify(pairing) : "";
}

export function deserializePairing(raw: string): PaseoPairing | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.kind === "direct" && typeof parsed.url === "string") return { kind: "direct", url: parsed.url };
    if (
      parsed?.kind === "relay" &&
      typeof parsed.serverId === "string" &&
      typeof parsed.daemonPublicKeyB64 === "string" &&
      typeof parsed.relay?.endpoint === "string"
    ) {
      return {
        kind: "relay",
        serverId: parsed.serverId,
        daemonPublicKeyB64: parsed.daemonPublicKeyB64,
        relay: { endpoint: parsed.relay.endpoint, useTls: parsed.relay.useTls !== false },
      };
    }
  } catch {
    // Stored by this app; anything else is garbage.
  }
  return null;
}
