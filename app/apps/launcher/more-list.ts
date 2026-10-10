import * as graphics from "../../graphics/image";
import type { GrayImage } from "../../graphics/image";
import type { InputEvent } from "../../ui/gestures";
import type { Layer, LayerContext } from "../../ui/layers";
import { shell } from "../../ui/shell/shell";
import { developerInMoreSetting } from "../../ui/dashboard-settings";
import { DIM, paintFooter, paintFrame, type Face } from "../../ui/terminal";
import { terminalFace } from "../../ui/terminal-face";
import * as art from "../home/stock-art";

export type MoreRow = { appId: string; label: string; icon: keyof typeof art.patterns };

/** The fixed More list: the apps without a home card, in this order. */
export const MORE_ROWS: readonly MoreRow[] = [
  { appId: "ai-chat", label: "AI Chat", icon: "ai" },
  { appId: "timer", label: "Timers", icon: "timer" },
  { appId: "navigate", label: "Navigate", icon: "navigate" },
  { appId: "settings", label: "Settings", icon: "settings" },
];
const DEVELOPER_ROW: MoreRow = { appId: "developer", label: "Developer", icon: "prompt" };

/** The rows to show: the fixed four, plus Developer when the phone's Developer setting asks for it. */
export function moreRows(developer = developerInMoreSetting.get()): readonly MoreRow[] {
  return developer ? [...MORE_ROWS, DEVELOPER_ROW] : MORE_ROWS;
}

const ROW_TOP = 24;
const ROW_PITCH = 46;

export function paintMoreList(image: GrayImage, face: Face, selected: number, rows: readonly MoreRow[] = moreRows()): void {
  paintFrame(image);
  rows.forEach((row, index) => {
    const y = ROW_TOP + index * ROW_PITCH;
    const active = index === selected;
    const value = active ? 255 : DIM;
    if (active) face.drawText(image, 22, y + 3, ">", 255);
    image.drawImage(art.icon(graphics, row.icon, 24).dimmed(value / 255), 48, y + 3);
    face.drawText(image, 86, y, row.label, value);
  });
  paintFooter(image, face, "· More", `${selected + 1}/${rows.length}`);
}

export class MoreListLayer implements Layer {
  readonly acceptsDirectional = true;
  private selected = 0;
  private launching = false;

  constructor(private readonly launchApp: (appId: string) => Promise<void> | void, private readonly rows: () => readonly MoreRow[] = moreRows) {}

  get selectedIndex(): number {
    return this.selected;
  }

  paint(ctx: LayerContext): GrayImage {
    const { width, height } = ctx.stack.getBaseSize();
    const image = new graphics.GrayImage(width, height);
    const rows = this.rows();
    this.selected = Math.min(this.selected, rows.length - 1);
    paintMoreList(image, terminalFace(), this.selected, rows);
    return image;
  }

  private async open(): Promise<void> {
    if (this.launching) return;
    this.launching = true;
    try {
      const row = this.rows()[this.selected];
      if (row) await this.launchApp(row.appId);
    } finally {
      this.launching = false;
    }
  }

  async handleInput(event: InputEvent): Promise<void> {
    switch (event.type) {
      case "scroll-up":
      case "swipe-up":
        this.selected = Math.max(0, this.selected - 1);
        return;
      case "scroll-down":
      case "swipe-down":
        this.selected = Math.min(this.rows().length - 1, this.selected + 1);
        return;
      case "click":
      case "swipe-right":
        await this.open();
        return;
      case "double-click":
      case "swipe-left":
        shell.yieldFocusToSidebar();
        return;
      default:
        return;
    }
  }

  async hitTest(_x: number, y: number): Promise<boolean> {
    const index = Math.floor((y - ROW_TOP + (ROW_PITCH - 27) / 2) / ROW_PITCH);
    if (index < 0 || index >= this.rows().length) return false;
    this.selected = index;
    await this.open();
    return true;
  }
}
