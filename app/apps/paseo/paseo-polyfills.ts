/**
 * Web globals the vendored Paseo transport expects inside the app worker:
 * crypto.getRandomValues (tweetnacl's key generation; backed by
 * java.security.SecureRandom) and TextEncoder/TextDecoder for UTF-8. Each is
 * installed only when the runtime lacks it. Import this module before the
 * vendored transport.
 */
declare const java: any;

const scope: any = typeof globalThis !== "undefined" ? globalThis : global;

function secureRandomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (typeof java !== "undefined") {
    const bytes = (Array as any).create("byte", length);
    new java.security.SecureRandom().nextBytes(bytes);
    for (let i = 0; i < length; i++) out[i] = bytes[i] & 0xff;
    return out;
  }
  // No Java (tests): fall back to the engine's weak randomness rather than refusing.
  for (let i = 0; i < length; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

if (!scope.crypto || typeof scope.crypto.getRandomValues !== "function") {
  const existing = scope.crypto && typeof scope.crypto === "object" ? scope.crypto : {};
  scope.crypto = Object.assign(existing, {
    getRandomValues<T extends ArrayBufferView>(array: T): T {
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      view.set(secureRandomBytes(view.length));
      return array;
    },
  });
}
if (typeof scope.self === "undefined") scope.self = scope;

if (typeof scope.TextEncoder === "undefined") {
  scope.TextEncoder = class {
    encode(text: string): Uint8Array {
      const bytes: number[] = [];
      for (const char of String(text)) {
        const cp = char.codePointAt(0)!;
        if (cp < 0x80) bytes.push(cp);
        else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      }
      return Uint8Array.from(bytes);
    }
  };
}

if (typeof scope.TextDecoder === "undefined") {
  scope.TextDecoder = class {
    constructor(_label?: string, private readonly options: { fatal?: boolean } = {}) {}
    decode(input?: ArrayBufferView | ArrayBuffer): string {
      if (!input) return "";
      const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      let out = "";
      for (let i = 0; i < bytes.length; ) {
        const b0 = bytes[i]!;
        let cp: number;
        let extra: number;
        if (b0 < 0x80) {
          cp = b0;
          extra = 0;
        } else if ((b0 & 0xe0) === 0xc0) {
          cp = b0 & 0x1f;
          extra = 1;
        } else if ((b0 & 0xf0) === 0xe0) {
          cp = b0 & 0x0f;
          extra = 2;
        } else if ((b0 & 0xf8) === 0xf0) {
          cp = b0 & 0x07;
          extra = 3;
        } else {
          if (this.options.fatal) throw new TypeError("The encoded data was not valid.");
          out += "�";
          i++;
          continue;
        }
        if (i + extra >= bytes.length) {
          if (this.options.fatal) throw new TypeError("The encoded data was not valid.");
          out += "�";
          break;
        }
        for (let k = 1; k <= extra; k++) cp = (cp << 6) | (bytes[i + k]! & 0x3f);
        out += String.fromCodePoint(cp);
        i += extra + 1;
      }
      return out;
    }
  };
}

export {};
