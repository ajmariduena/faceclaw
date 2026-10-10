import { EvenHubFont } from "../graphics/evenhub-font";
import { getDefaultSmallFont } from "../graphics/ui-fonts";
import type { Face } from "./paseo/paseo-painter";

/** The stock G2 font for terminal-frame screens, or the UI font until the firmware fonts are extracted. */
export function terminalFace(): Face {
  try {
    const stock = EvenHubFont.get();
    if (stock.hasGlyph(65)) return stock;
  } catch (error) {
    console.warn("Stock font unavailable", error);
  }
  const font = getDefaultSmallFont();
  return {
    lineHeight: font.lineHeight,
    measureLine: (text) => font.measureText(text),
    drawText: (image, x, y, text, value = 255) => image.drawText(font, x, y, text, value),
  };
}
