const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard base64 (with padding) of raw bytes; pure JS, so it runs on every thread and in tests. */
export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += ALPHABET[(triple >> 18) & 63]! + ALPHABET[(triple >> 12) & 63]!;
    out += i + 1 < bytes.length ? ALPHABET[(triple >> 6) & 63]! : "=";
    out += i + 2 < bytes.length ? ALPHABET[triple & 63]! : "=";
  }
  return out;
}
