/**
 * Stock's system font (the one its menus, notifications and dialogs use),
 * extracted from the firmware next to the EvenHub fonts (firmware-fonts.ts)
 * and laid out exactly like LVGL: per glyph, the advance in 1/16 px plus the
 * class kerning against the next glyph, rounded to whole pixels. Code points
 * it lacks draw nothing, as on stock.
 */
import { File, knownFolders } from "@nativescript/core";
import { STOCK_UI_FONT_FILENAME, isStockUiFontAsset, type StockUiFontAsset } from "../g2/firmware-fonts";
import { BdfFont, type Glyph } from "./bdffont";
import type { GrayImage } from "./image";

type Spacing = { advance: number; table: number; left: number; right: number };

export class StockUiFont extends BdfFont {
  private readonly spacing: Map<number, Spacing>;
  private readonly kerning: StockUiFontAsset["kerning"];

  constructor(asset: StockUiFontAsset) {
    const bitmap = base64Decode(asset.bitmapBase64);
    const glyphs = new Map<number, Glyph>();
    const spacing = new Map<number, Spacing>();
    for (const [key, record] of Object.entries(asset.glyphs)) {
      const [boxW = 0, boxH = 0, ofsX = 0, ofsY = 0, offset = 0, , advance = 0, table = -1, left = 0, right = 0] = record;
      const codePoint = Number(key);
      const stride = Math.floor(boxW / 2) + 1;
      const coverage = new Uint8Array(boxW * boxH);
      for (let row = 0; row < boxH; row++) {
        for (let x = 0; x < boxW; x++) {
          const byte = bitmap[offset + row * stride + (x >> 1)] ?? 0;
          coverage[row * boxW + x] = x & 1 ? byte & 15 : byte >> 4;
        }
      }
      glyphs.set(codePoint, {
        encoding: codePoint,
        dwidthX: (advance + 8) >> 4,
        bbxWidth: boxW,
        bbxHeight: boxH,
        bbxX: ofsX,
        bbxY: ofsY,
        bitmapRows: [],
        coverage,
        advance: advance / 16,
      });
      spacing.set(codePoint, { advance, table, left, right });
    }
    super({
      ascent: asset.baseline,
      descent: asset.lineHeight - asset.baseline,
      defaultChar: -1,
      glyphs,
      atlasKey: STOCK_UI_FONT_FILENAME,
    });
    this.spacing = spacing;
    this.kerning = asset.kerning;
  }

  private static cached: StockUiFont | null | undefined;

  /** The extracted font, or null until the firmware fonts have been prepared. */
  static get(): StockUiFont | null {
    if (StockUiFont.cached === undefined) {
      StockUiFont.cached = null;
      try {
        const path = `${knownFolders.documents().path}/${STOCK_UI_FONT_FILENAME}`;
        if (File.exists(path)) {
          const parsed: unknown = JSON.parse(File.fromPath(path).readTextSync());
          if (isStockUiFontAsset(parsed)) StockUiFont.cached = new StockUiFont(parsed);
        }
      } catch (error) {
        console.warn(`Could not load the extracted G2 system font: ${error}`);
      }
    }
    return StockUiFont.cached;
  }

  /** After an extraction, so the next get() reads the new asset. */
  static invalidate(): void {
    StockUiFont.cached = undefined;
  }

  override getGlyph(codePoint: number): Glyph | undefined {
    return this.hasGlyph(codePoint) ? super.getGlyph(codePoint) : undefined;
  }

  /** Whole-pixel pen advance of `codePoint` when `next` follows it (0 at the end of a line). */
  advanceOf(codePoint: number, next = 0): number {
    const own = this.spacing.get(codePoint);
    if (!own) return 0;
    let kern = 0;
    const following = next ? this.spacing.get(next) : undefined;
    if (following && own.table >= 0 && own.table === following.table && own.left > 0 && following.right > 0) {
      const table = this.kerning[own.table]!;
      kern = table.values[(own.left - 1) * table.rightClasses + (following.right - 1)] ?? 0;
    }
    return (own.advance + kern + 8) >> 4;
  }

  override measureText(text: string): number {
    const codePoints = Array.from(text, (char) => char.codePointAt(0)!);
    let width = 0;
    for (let i = 0; i < codePoints.length; i++) width += this.advanceOf(codePoints[i]!, codePoints[i + 1]);
    return width;
  }

  override drawText(image: GrayImage, x: number, y: number, text: string, value: number): void {
    const codePoints = Array.from(text, (char) => char.codePointAt(0)!);
    let penX = x;
    for (let i = 0; i < codePoints.length; i++) {
      const codePoint = codePoints[i]!;
      if (codePoint === 10) {
        penX = x;
        y += this.lineHeight;
        continue;
      }
      const glyph = this.getGlyph(codePoint);
      if (glyph && glyph.bbxWidth > 0) image.drawGlyph(this, glyph, penX, y, value);
      penX += this.advanceOf(codePoint, codePoints[i + 1]);
    }
  }
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Decode(text: string): Uint8Array {
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let bitCount = 0;
  let length = 0;
  for (let i = 0; i < text.length; i++) {
    const digit = BASE64_ALPHABET.indexOf(text[i]!);
    if (digit < 0) continue;
    bits = ((bits << 6) | digit) & 0xffffff;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      out[length++] = (bits >> bitCount) & 0xff;
    }
  }
  return out.subarray(0, length);
}
