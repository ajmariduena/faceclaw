import { GrayImage } from "../../graphics/image";
import { renderIcon, type IconName } from "../../graphics/icons";
import { fitLine, wrapCapped } from "../../graphics/terminal-painter";
import type { InputEvent } from "../gestures";
import type { Layer, LayerContext } from "../layers";
import { terminalFace } from "../terminal-face";
import { appViewportRect, SHELL_OPAQUE_BLACK } from "./geometry";

export type WindowAlert = {
  /** Echoed back to the window when the user opens the alert. */
  key: string;
  icon?: IconName;
  /** "Paseo · Needs input" */
  app: string;
  sender: string;
  body: string;
};

// Even's notification box (research/even-ui/referencia-stock.md): x 46–539, y 28 down, radius 6.
const BOX_X = 46;
const BOX_Y = 28;
const BOX_RIGHT_MARGIN = 36;
const PAD_X = 20;
const PAD_Y = 12;

/**
 * A window's alert in Even's notification box, alone on the screen it woke.
 * Tap dismisses it, double tap opens it in the window: opening is the rarer choice.
 */
export class WindowAlertLayer implements Layer {
  constructor(
    public alert: WindowAlert,
    private readonly actions: { open: () => void; dismiss: () => void; removed: () => void },
  ) {}

  paint(ctx: LayerContext): GrayImage {
    const base = ctx.stack.getBaseSize();
    const image = new GrayImage(base.width, base.height, 0);
    const face = terminalFace();
    const area = appViewportRect("min");
    const pitch = Math.max(27, face.lineHeight + 4);
    const x = area.x + BOX_X, y = area.y + BOX_Y;
    const width = area.width - BOX_X - BOX_RIGHT_MARGIN;
    const textWidth = width - 2 * PAD_X;
    const body = wrapCapped(face, this.alert.body, textWidth, 2);
    const height = Math.max(151, 2 * PAD_Y + pitch * (2 + body.length) + 7);
    image.fillRoundedRect(x, y, width, height, SHELL_OPAQUE_BLACK, 6);
    image.drawRoundedRect(x, y, width, height, 255, 6);
    const icon = renderIcon(this.alert.icon ?? "bell", 20);
    let left = x + PAD_X;
    if (icon) { image.drawImage(icon, left, y + PAD_Y + 2); left += 28; }
    face.drawText(image, left, y + PAD_Y, fitLine(face, this.alert.app, x + width - PAD_X - left - 60), 153);
    face.drawText(image, x + width - PAD_X - face.measureLine("now"), y + PAD_Y, "now", 153);
    const senderY = y + PAD_Y + pitch + 7;
    face.drawText(image, x + PAD_X, senderY, fitLine(face, this.alert.sender, textWidth), 255);
    body.forEach((line, i) => face.drawText(image, x + PAD_X, senderY + pitch * (i + 1), line, 190));
    return image;
  }

  handleInput(event: InputEvent, _ctx: LayerContext): void {
    if (event.type === "click") this.actions.dismiss();
    else if (event.type === "double-click") this.actions.open();
  }

  onRemoved(): void {
    this.actions.removed();
  }
}
