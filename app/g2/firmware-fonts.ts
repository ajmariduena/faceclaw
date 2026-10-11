/**
 * Extract the G2's proprietary 20 px EvenHub fallback fonts from a verified
 * stock EVENOTA image. The resulting compact JSON contains only glyph boxes
 * and bitmap bytes; text advances and kerning continue to come from pretext.
 *
 * These fonts are deliberately generated at install time rather than bundled
 * with Faceclaw because their redistribution terms are unclear.
 */

export const EVENHUB_RUNTIME_FONT_FILENAME = "evenhub-firmware-20.json";
/** Stock's system font (menus, notifications, dialogs), drawn with its own advances and kerning. */
export const STOCK_UI_FONT_FILENAME = "even-system-29.json";

const MAIN_APP_NAME = "ota/s200_firmware_ota.bin";
const MAIN_APP_LOAD_ADDRESS = 0x00438000;
const MAIN_APP_PREAMBLE_SIZE = 0x20;
const COMPONENT_HEADER_SIZE = 128;

type FontSpec = {
  descriptor: number;
  lineHeight: number;
  baseLine: number;
};

// Priority order is the stock EvenHub fallback chain (before the CJK font).
// These are lv_font_fmt_txt_dsc_t addresses in the stock image the patch set
// is built against (CFW_PATCH_SET.base), so they move on every firmware
// rebase: run scripts/find-firmware-fonts.py against the new stock .bin and
// match rows by cmap count / code-point count (12/8081, 9/9566, 4/11590).
//   2.3.0.24: 0x007b699c, 0x007b69b0, 0x007b68c0
//   2.2.9.22: 0x007a8954, 0x007a8968, 0x007a8878
//   2.2.6.10: 0x0077f414, 0x0077f428, 0x0077f374
const FONT_SPECS: FontSpec[] = [
  { descriptor: 0x007b699c, lineHeight: 27, baseLine: 5 },
  { descriptor: 0x007b69b0, lineHeight: 26, baseLine: 5 },
  { descriptor: 0x007b68c0, lineHeight: 20, baseLine: 2 },
];

// The system font's chain, same rebase caveat as FONT_SPECS (12/9 cmaps, then
// the shared symbol font). Only the first spec's metrics are used.
//   2.3.0.24: 0x007b69ec, 0x007b6a00, 0x007b68c0
const STOCK_UI_FONT_SPECS: FontSpec[] = [
  { descriptor: 0x007b69ec, lineHeight: 29, baseLine: 6 },
  { descriptor: 0x007b6a00, lineHeight: 29, baseLine: 6 },
  { descriptor: 0x007b68c0, lineHeight: 20, baseLine: 2 },
];

type ExtractedGlyph = {
  boxW: number;
  boxH: number;
  ofsX: number;
  ofsY: number;
  bytes: Uint8Array;
};

export type EvenHubFontAsset = {
  lineHeight: number;
  baseline: number;
  glyphs: Record<string, [number, number, number, number, number, number]>;
  bitmapBase64: string;
};

/**
 * glyphs: [boxW, boxH, ofsX, ofsY, bitmapOffset, bitmapLen, advance in 1/16 px,
 * kerning table index or -1, left class, right class]. kerning[i].values holds
 * the left×right class-pair values in 1/16 px (LVGL kern_classes format).
 */
export type StockUiFontAsset = {
  lineHeight: number;
  baseline: number;
  glyphs: Record<string, number[]>;
  kerning: { rightClasses: number; values: number[] }[];
  bitmapBase64: string;
};

export function isStockUiFontAsset(value: unknown): value is StockUiFontAsset {
  const asset = value as Partial<StockUiFontAsset> | null;
  return !!asset && Number.isFinite(asset.lineHeight) && Number.isFinite(asset.baseline) &&
    !!asset.glyphs && typeof asset.glyphs === "object" && Object.keys(asset.glyphs).length >= 300 &&
    Array.isArray(asset.kerning) && typeof asset.bitmapBase64 === "string" && asset.bitmapBase64.length > 0;
}

/** Reject missing, truncated, or otherwise unusable persisted font assets. */
export function isEvenHubFontAsset(value: unknown): value is EvenHubFontAsset {
  const asset = value as Partial<EvenHubFontAsset> | null;
  return !!asset && Number.isFinite(asset.lineHeight) && Number.isFinite(asset.baseline) &&
    !!asset.glyphs && typeof asset.glyphs === "object" && Object.keys(asset.glyphs).length >= 700 &&
    typeof asset.bitmapBase64 === "string" && asset.bitmapBase64.length > 0;
}

/** Extract and serialize the fonts used for EvenHub background text. */
export function extractEvenHubFontAsset(firmware: ArrayBuffer): EvenHubFontAsset {
  const app = mainApplication(firmware);
  const merged = new Map<number, ExtractedGlyph>();
  for (const spec of FONT_SPECS) extractFont(app, spec, merged);

  if (merged.size < 700) {
    throw new Error(`firmware font extraction produced only ${merged.size} glyphs`);
  }

  const records: EvenHubFontAsset["glyphs"] = {};
  const chunks: Uint8Array[] = [];
  let bitmapSize = 0;
  for (const [codePoint, glyph] of [...merged].sort((a, b) => a[0] - b[0])) {
    records[String(codePoint)] = [
      glyph.boxW,
      glyph.boxH,
      glyph.ofsX,
      glyph.ofsY,
      bitmapSize,
      glyph.bytes.length,
    ];
    chunks.push(glyph.bytes);
    bitmapSize += glyph.bytes.length;
  }

  const bitmap = new Uint8Array(bitmapSize);
  let offset = 0;
  for (const chunk of chunks) {
    bitmap.set(chunk, offset);
    offset += chunk.length;
  }

  const layout = FONT_SPECS[0]!;
  return {
    lineHeight: layout.lineHeight,
    baseline: layout.lineHeight - layout.baseLine,
    glyphs: records,
    bitmapBase64: base64Encode(bitmap),
  };
}

export function extractStockUiFontAsset(firmware: ArrayBuffer): StockUiFontAsset {
  const app = mainApplication(firmware);
  const records: StockUiFontAsset["glyphs"] = {};
  const kerning: StockUiFontAsset["kerning"] = [];
  const chunks: Uint8Array[] = [];
  let bitmapSize = 0;
  for (const spec of STOCK_UI_FONT_SPECS) {
    const kern = kerningClasses(app, spec);
    const table = kern ? kerning.push({ rightClasses: kern.rightClasses, values: kern.values }) - 1 : -1;
    for (const [codePoint, glyphId] of fontMapping(app, spec)) {
      const key = String(codePoint);
      if (glyphId <= 0 || records[key]) continue;
      const glyph = readGlyph(app, spec, glyphId);
      const classes = kern ? [table, kern.left(glyphId), kern.right(glyphId)] : [-1, 0, 0];
      records[key] = [glyph.boxW, glyph.boxH, glyph.ofsX, glyph.ofsY, bitmapSize, glyph.bytes.length, glyph.advance, ...classes];
      chunks.push(glyph.bytes);
      bitmapSize += glyph.bytes.length;
    }
  }
  if (Object.keys(records).length < 300) {
    throw new Error(`system font extraction produced only ${Object.keys(records).length} glyphs`);
  }

  const bitmap = new Uint8Array(bitmapSize);
  let offset = 0;
  for (const chunk of chunks) {
    bitmap.set(chunk, offset);
    offset += chunk.length;
  }
  const layout = STOCK_UI_FONT_SPECS[0]!;
  return { lineHeight: layout.lineHeight, baseline: layout.lineHeight - layout.baseLine, glyphs: records, kerning, bitmapBase64: base64Encode(bitmap) };
}

/** lv_font_fmt_txt_kern_classes_t, with values scaled to 1/16 px as LVGL applies them. */
function kerningClasses(app: AddressedImage, spec: FontSpec): { rightClasses: number; values: number[]; left(glyphId: number): number; right(glyphId: number): number } | null {
  const descriptor = app.u32(spec.descriptor + 12);
  const scale = app.u16(spec.descriptor + 16);
  if (!descriptor || !((app.u16(spec.descriptor + 18) >> 13) & 1)) return null;
  const pairValues = app.u32(descriptor);
  const leftMapping = app.u32(descriptor + 4);
  const rightMapping = app.u32(descriptor + 8);
  const leftClasses = app.u8(descriptor + 12);
  const rightClasses = app.u8(descriptor + 13);
  const values = Array.from(app.bytes(pairValues, leftClasses * rightClasses), (byte) => (((byte << 24) >> 24) * scale) >> 4);
  return { rightClasses, values, left: (glyphId) => app.u8(leftMapping + glyphId), right: (glyphId) => app.u8(rightMapping + glyphId) };
}

function mainApplication(firmware: ArrayBuffer): AddressedImage {
  const image = new FirmwareImage(firmware);
  const mainApp = image.findComponent(MAIN_APP_NAME);
  if (mainApp.payloadSize <= MAIN_APP_PREAMBLE_SIZE) {
    throw new Error("the main firmware component is missing its application payload");
  }
  return new AddressedImage(
    image,
    mainApp.payloadOffset + MAIN_APP_PREAMBLE_SIZE,
    mainApp.payloadSize - MAIN_APP_PREAMBLE_SIZE,
    MAIN_APP_LOAD_ADDRESS,
  );
}

function fontMapping(app: AddressedImage, spec: FontSpec): Map<number, number> {
  const cmapAddress = app.u32(spec.descriptor + 8);
  const packed = app.u16(spec.descriptor + 18);
  const cmapCount = packed & 0x1ff;
  const bitsPerPixel = (packed >> 9) & 0xf;
  const bitmapFormat = (packed >> 14) & 0x3;
  if (bitsPerPixel !== 4 || bitmapFormat !== 3 || cmapCount === 0) {
    throw new Error(
      `unsupported firmware font at 0x${spec.descriptor.toString(16)} ` +
        `(bpp=${bitsPerPixel}, format=${bitmapFormat}, cmaps=${cmapCount})`,
    );
  }
  const mapping = new Map<number, number>();
  for (let index = 0; index < cmapCount; index++) {
    resolveCmap(app, cmapAddress + index * 20, mapping);
  }
  return mapping;
}

function readGlyph(app: AddressedImage, spec: FontSpec, glyphId: number): ExtractedGlyph & { advance: number } {
  const descriptor = app.u32(spec.descriptor + 4) + glyphId * 16;
  const boxW = app.u16(descriptor + 8);
  const boxH = app.u16(descriptor + 10);
  const length = boxW > 0 && boxH > 0 ? rowStride(boxW) * boxH : 0;
  return {
    advance: app.u32(descriptor + 4),
    boxW,
    boxH,
    ofsX: app.i16(descriptor + 12),
    ofsY: app.i16(descriptor + 14),
    bytes: app.bytes(app.u32(spec.descriptor) + app.u32(descriptor), length),
  };
}

function extractFont(app: AddressedImage, spec: FontSpec, merged: Map<number, ExtractedGlyph>): void {
  for (const [codePoint, glyphId] of fontMapping(app, spec)) {
    if (glyphId <= 0 || merged.has(codePoint)) continue;
    const { advance: _advance, ...glyph } = readGlyph(app, spec, glyphId);
    merged.set(codePoint, glyph);
  }
}

function resolveCmap(app: AddressedImage, address: number, mapping: Map<number, number>): void {
  const rangeStart = app.u32(address);
  const rangeLength = app.u16(address + 4);
  const glyphIdStart = app.u16(address + 6);
  const unicodeList = app.u32(address + 8);
  const glyphIdOffsets = app.u32(address + 12);
  const listLength = app.u16(address + 16);
  const type = app.u8(address + 18);

  if (type === 2) {
    for (let relative = 0; relative < rangeLength; relative++) {
      mapping.set(rangeStart + relative, glyphIdStart + relative);
    }
    return;
  }

  if (type === 0) {
    for (let relative = 0; relative < rangeLength; relative++) {
      const offset = app.u8(glyphIdOffsets + relative);
      if (relative !== 0 && offset === 0) continue;
      mapping.set(rangeStart + relative, glyphIdStart + offset);
    }
    return;
  }

  if (type === 3 || type === 1) {
    for (let index = 0; index < listLength; index++) {
      const relative = app.u16(unicodeList + index * 2);
      let offset = index;
      if (glyphIdOffsets) {
        offset = type === 1 ? app.u16(glyphIdOffsets + index * 2) : app.u8(glyphIdOffsets + index);
        if (index !== 0 && offset === 0) continue;
      }
      mapping.set(rangeStart + relative, glyphIdStart + offset);
    }
    return;
  }

  throw new Error(`unknown LVGL font cmap type ${type} at 0x${address.toString(16)}`);
}

function rowStride(boxWidth: number): number {
  // Even's LVGL pipeline aligns every row to a whole byte and adds a padding
  // byte for even widths.
  return Math.floor(boxWidth / 2) + 1;
}

class FirmwareImage {
  private readonly view: DataView;
  private readonly data: Uint8Array;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.data = new Uint8Array(buffer);
    if (this.data.length < 0x40 || ascii(this.data, 0, 8) !== "EVENOTA\0") {
      throw new Error("downloaded image is not an EVENOTA firmware container");
    }
  }

  findComponent(name: string): { payloadOffset: number; payloadSize: number } {
    const count = this.u32(8);
    if (count <= 0 || count > 64) throw new Error(`invalid firmware component count ${count}`);
    for (let index = 0; index < count; index++) {
      const toc = 0x40 + index * 16;
      const componentOffset = this.u32(toc + 4);
      this.check(componentOffset, COMPONENT_HEADER_SIZE);
      const payloadSize = this.u32(componentOffset + 8);
      const filename = nulTerminatedAscii(this.data, componentOffset + 48, 80);
      const payloadOffset = componentOffset + COMPONENT_HEADER_SIZE;
      this.check(payloadOffset, payloadSize);
      if (filename === name) return { payloadOffset, payloadSize };
    }
    throw new Error(`firmware component ${name} was not found`);
  }

  u32(offset: number): number {
    this.check(offset, 4);
    return this.view.getUint32(offset, true);
  }

  bytes(offset: number, length: number): Uint8Array {
    this.check(offset, length);
    return this.data.slice(offset, offset + length);
  }

  check(offset: number, length: number): void {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > this.data.length) {
      throw new Error(`firmware range 0x${offset.toString(16)} + ${length} is out of bounds`);
    }
  }
}

class AddressedImage {
  constructor(
    private readonly firmware: FirmwareImage,
    private readonly fileOffset: number,
    private readonly length: number,
    private readonly loadAddress: number,
  ) {}

  u8(address: number): number {
    return this.bytes(address, 1)[0]!;
  }

  u16(address: number): number {
    const bytes = this.bytes(address, 2);
    return bytes[0]! | (bytes[1]! << 8);
  }

  i16(address: number): number {
    const value = this.u16(address);
    return value & 0x8000 ? value - 0x10000 : value;
  }

  u32(address: number): number {
    const bytes = this.bytes(address, 4);
    return (bytes[0]! | (bytes[1]! << 8) | (bytes[2]! << 16) | (bytes[3]! << 24)) >>> 0;
  }

  bytes(address: number, length: number): Uint8Array {
    const relative = address - this.loadAddress;
    if (relative < 0 || relative + length > this.length) {
      throw new Error(`firmware address 0x${address.toString(16)} + ${length} is outside the main application`);
    }
    return this.firmware.bytes(this.fileOffset + relative, length);
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let i = 0; i < length; i++) value += String.fromCharCode(bytes[offset + i] ?? 0);
  return value;
}

function nulTerminatedAscii(bytes: Uint8Array, offset: number, maxLength: number): string {
  let value = "";
  for (let i = 0; i < maxLength; i++) {
    const byte = bytes[offset + i] ?? 0;
    if (byte === 0) break;
    value += String.fromCharCode(byte);
  }
  return value;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const packed = (a << 16) | (b << 8) | c;
    result += BASE64_ALPHABET[(packed >> 18) & 63];
    result += BASE64_ALPHABET[(packed >> 12) & 63];
    result += i + 1 < bytes.length ? BASE64_ALPHABET[(packed >> 6) & 63] : "=";
    result += i + 2 < bytes.length ? BASE64_ALPHABET[packed & 63] : "=";
  }
  return result;
}
