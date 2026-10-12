import { EvenHubFont } from "../graphics/evenhub-font";
import type { UiFont } from "../graphics/image";
import { StockUiFont } from "../graphics/stock-ui-font";
import { getDefaultSmallFont } from "../graphics/ui-fonts";
import type { Face } from "./terminal";

/**
 * Stock's system font once the firmware fonts are extracted (the 20 px
 * EvenHub font for installs extracted before it existed), else the bundled Roboto.
 */
export function stockFace(): Face {
  const system = StockUiFont.get();
  if (system) return uiFontFace(system);
  try {
    const stock = EvenHubFont.get();
    if (stock.hasGlyph(65)) return stock;
  } catch (error) {
    console.warn("Terminal font unavailable", error);
  }
  return uiFontFace(getDefaultSmallFont());
}

export function uiFontFace(font: UiFont): Face {
  return {
    lineHeight: font.lineHeight,
    measureLine: (text) => font.measureText(text),
    drawText: (image, x, y, text, value = 255) => font.drawText(image, x, y, text, value),
  };
}
