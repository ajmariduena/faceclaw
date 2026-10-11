import { installedFontPath, ensurePreinstalledFonts } from "../graphics/installed-fonts";
import { applyTextLayout as applyPainterLayout } from "../graphics/terminal-painter";
import { TtfFont } from "../graphics/ttf-font";
import { StockUiFont } from "../graphics/stock-ui-font";
import { stockFace, uiFontFace } from "./stock-face";
import { applyTextLayout, type Face } from "./terminal";
import { textMetrics } from "./text-size";

/**
 * The face for terminal-frame screens under Settings > Text size. Also moves
 * the shared layout to the matching pitch, so callers must take the face
 * before reading PITCH, LIST_CAPACITY or FOOTER_TOP for a paint.
 */
export function terminalFace(): Face {
  const metrics = textMetrics();
  // Normal size steps from Even's 20 px font to its 29 px system font once that is extracted.
  const pitch = metrics.sizePx ? metrics.pitch : (StockUiFont.get()?.lineHeight ?? metrics.pitch);
  applyTextLayout(pitch);
  applyPainterLayout(pitch);
  if (metrics.sizePx) {
    ensurePreinstalledFonts();
    const font = TtfFont.load(installedFontPath("Roboto-Regular.ttf"), metrics.sizePx);
    if (font) return uiFontFace(font);
  }
  return stockFace();
}
