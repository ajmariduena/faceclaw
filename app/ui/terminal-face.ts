import { installedFontPath, ensurePreinstalledFonts } from "../graphics/installed-fonts";
import { applyTextLayout as applyPainterLayout } from "../graphics/terminal-painter";
import { TtfFont } from "../graphics/ttf-font";
import { stockFace } from "./stock-face";
import { applyTextLayout, type Face } from "./terminal";
import { textMetrics } from "./text-size";

function ttfFace(font: TtfFont): Face {
  return {
    lineHeight: font.lineHeight,
    measureLine: (text) => font.measureText(text),
    drawText: (image, x, y, text, value = 255) => font.drawText(image, x, y, text, value),
  };
}

/**
 * The face for terminal-frame screens under Settings > Text size. Also moves
 * the shared layout to the matching pitch, so callers must take the face
 * before reading PITCH, LIST_CAPACITY or FOOTER_TOP for a paint.
 */
export function terminalFace(): Face {
  const metrics = textMetrics();
  applyTextLayout(metrics.pitch);
  applyPainterLayout(metrics.pitch);
  if (metrics.sizePx) {
    ensurePreinstalledFonts();
    const font = TtfFont.load(installedFontPath("Roboto-Regular.ttf"), metrics.sizePx);
    if (font) return ttfFace(font);
  }
  return stockFace();
}
