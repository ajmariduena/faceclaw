import { GrayImage } from "../../graphics/image";
import type { InputEvent } from "../../ui/gestures";
import type { Layer, LayerContext } from "../../ui/layers";
import { createInProcessWindow, type InProcessAppOptions, type InProcessWindow } from "../../ui/shell/in-process-window";
import { shell } from "../../ui/shell/shell";
import { CONTENT_TOP, DIM, LEFT, paintFooter, paintFrame, type Face } from "../../ui/terminal";
import { terminalFace } from "../../ui/terminal-face";

export const CONVERSE_WINDOW_ID = "converse";
export const CONVERSE_SURFACE_ID = "window:converse";

/** The placeholder until Converse is built (research/conversar/plan.md). */
export function paintConversePlaceholder(image: GrayImage, face: Face): void {
  paintFrame(image);
  face.drawText(image, LEFT, CONTENT_TOP, "Not built yet", 255);
  face.drawText(image, LEFT, CONTENT_TOP + 27, "Live facts · ES/EN", DIM);
  paintFooter(image, face, "· Converse", "");
}

class ConversePlaceholderLayer implements Layer {
  paint(ctx: LayerContext): GrayImage {
    const { width, height } = ctx.stack.getBaseSize();
    const image = new GrayImage(width, height);
    paintConversePlaceholder(image, terminalFace());
    return image;
  }

  handleInput(event: InputEvent): void {
    if (event.type === "double-click") shell.yieldFocusToSidebar();
  }
}

export function createConverseWindow(options: InProcessAppOptions): InProcessWindow {
  return createInProcessWindow({
    ...options,
    appId: "converse",
    windowId: CONVERSE_WINDOW_ID,
    title: "Converse",
    iconLetter: "Cv",
    icon: "message-circle",
    closeable: true,
    baseLayer: new ConversePlaceholderLayer(),
  });
}
