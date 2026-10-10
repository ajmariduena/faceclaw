import { EvenHubFont } from "../graphics/evenhub-font";
import { getDefaultSmallFont } from "../graphics/ui-fonts";
import type { Face } from "./terminal";

/** The stock G2 font when the firmware assets are extracted, else the bundled Roboto. */
export function terminalFace(): Face {
  try {
    const stock = EvenHubFont.get();
    if (stock.hasGlyph(65)) return stock;
  } catch (error) {
    console.warn("Terminal font unavailable", error);
  }
  const font = getDefaultSmallFont();
  return {
    lineHeight: font.lineHeight,
    measureLine: (text) => font.measureText(text),
    drawText: (image, x, y, text, value) => font.drawText(image, x, y, text, value),
  };
}
