import { GrayImage } from "../../graphics/image";
import { paintChat, chatMaxScrollBack, chatRowCount, type ChatLine, type ChatView } from "../../graphics/terminal-painter";
import type { Face } from "../../ui/terminal";
import { terminalFace } from "../../ui/terminal-face";
import { grokBotHub } from "../../assistant/grokbot/grokbot";
import { OFFLINE, type BotState } from "../../assistant/grokbot/grokbot-hub";
import { botsChatDraftSetting, botsWakeOnReplySetting, toggleSettingMenuItem } from "../../ui/dashboard-settings";
import { onSettingsStoreChanged } from "../../native/settings-store";
import type { InputEvent } from "../../ui/gestures";
import type { Layer, LayerContext } from "../../ui/layers";
import type { MenuItem } from "../../ui/menu";
import { createInProcessWindow, type InProcessAppOptions, type InProcessWindow } from "../../ui/shell/in-process-window";
import { shell } from "../../ui/shell/shell";
import { VoiceDraft } from "../../ui/voice-draft";
import { ChatDraft, DRAFT_OPTIONS } from "../../ui/chat-draft";
import type { AppContext } from "../app-definition";
import { BOT_TITLE, chatEmptyMessage, chatLines, elapsedClock } from "./bots-model";

export const BOTS_WINDOW_ID = "bots";
const BOTS_SURFACE_ID = "window:bots";
const SCROLL_ROWS = 3;

let activeLayer: BotsLayer | null = null;

/** Always the glasses bot's chat, at its newest message. */
export async function launchBots(ctx: AppContext): Promise<void> {
  const visible = shell.isWindowVisible(BOTS_WINDOW_ID);
  await ctx.launchInProcessApp(BOTS_WINDOW_ID, BOTS_SURFACE_ID, options => createBotsWindow(options));
  // Already on screen (the wakeword while reading back): keep the user's place.
  if (!visible) activeLayer?.land();
}

/** The wakeword's dictation, once Grok Bot is in front. */
export function startBotsListening(): boolean { return activeLayer?.listen() ?? false; }

/** Text composed elsewhere (the voice dialog, the watch, the remote API); a send that fails lands in the chat's draft. */
export function sendToBots(text: string): void {
  if (activeLayer) activeLayer.send(text);
  else void grokBotHub.send(grokBotHub.defaultBot, text);
}

class BotsLayer implements Layer {
  readonly acceptsDirectional = true;
  readonly draft: VoiceDraft;
  readonly review = new ChatDraft();
  private scrollBack = 0;
  private maxScrollBack = 0;
  private shownRows = 0;
  private notSent = "";
  private foreground = false;
  private screenOn = shell.isScreenOn();
  private requestRender = () => {};

  constructor(private readonly options: InProcessAppOptions) {
    this.draft = new VoiceDraft(options.actions, () => shell.prepareChatVoiceCapture(BOTS_WINDOW_ID),
      () => this.requestRender(), text => this.reviewText(text));
  }

  start(render: () => void): () => void {
    this.requestRender = render;
    const off = grokBotHub.onChanged(() => { this.syncHub(); if (this.visible) render(); });
    const offSettings = onSettingsStoreChanged(key => {
      if (key === "grokbot.chatDraft" && this.review.editing) { this.review.text = botsChatDraftSetting.get(); render(); }
    });
    const timer = setInterval(() => {
      if (this.visible && (this.draft.active || this.bot.working)) render();
    }, 500);
    return () => { off(); offSettings(); clearInterval(timer); };
  }

  private get visible(): boolean { return this.foreground && this.screenOn; }
  private get bot(): BotState { return grokBotHub.bot(grokBotHub.defaultBot)!; }

  setForeground(foreground: boolean): void { this.foreground = foreground; this.syncHub(); }
  setScreenOn(on: boolean): void { this.screenOn = on; this.syncHub(); }

  private syncHub(): void {
    const name = grokBotHub.defaultBot;
    grokBotHub.setWatching(this.visible ? [name] : []);
    grokBotHub.setViewing(this.visible ? name : null);
  }

  land(): void {
    this.scrollBack = 0;
    this.syncHub();
    this.requestRender();
  }

  listen(): boolean {
    this.scrollBack = 0;
    return this.startListening();
  }

  private startListening(): boolean {
    if (this.draft.active || this.review.active) return false;
    if (!grokBotHub.configured) { shell.showAlert("Add a Cursor key on the phone"); return false; }
    void this.draft.start();
    return true;
  }

  reviewText(text: string): void {
    this.scrollBack = 0;
    this.notSent = "";
    this.review.review(text);
    this.requestRender();
  }

  send(text: string): void {
    this.scrollBack = 0;
    void grokBotHub.send(grokBotHub.defaultBot, text).then(reason => {
      if (!reason) return;
      if (this.draft.active || this.review.active) return;
      this.review.review(text);
      this.notSent = reason;
      this.requestRender();
    });
  }

  paint(ctx: LayerContext): GrayImage {
    const size = ctx.stack.getBaseSize();
    const image = new GrayImage(size.width, size.height);
    this.paintChat(image, terminalFace(), this.bot);
    return image;
  }

  private paintChat(image: GrayImage, face: Face, bot: BotState): void {
    const lines: ChatLine[] = chatLines(bot, grokBotHub.error);
    const rows = chatRowCount(face, lines);
    // Rows arriving below keep a scrolled-back reader on the same text.
    if (this.scrollBack > 0 && rows > this.shownRows) this.scrollBack += rows - this.shownRows;
    this.shownRows = rows;
    if (this.draft.active || this.review.active) lines.push({ role: "user", text: this.draft.text || this.review.text || "…", live: this.draft.active });
    const now = Date.now();
    const footer = this.draft.active ? { left: this.draft.phase === "finishing" ? "· Finishing" : "· Listening", right: elapsedClock(now - this.draft.startedAt) } :
      bot.working ? { left: "· Working", right: elapsedClock(now - bot.workingSince) } :
      { left: `· ${BOT_TITLE}`, right: grokBotHub.error === OFFLINE ? "Offline" : this.scrollBack > 0 ? "older" : "" };
    const question = this.notSent ? `Not sent · ${this.notSent}` : this.review.editing ? "Edit on phone" : "Draft";
    const view: ChatView = { lines, scrollBack: this.scrollBack, full: true, footer,
      permission: this.review.active ? { question, options: DRAFT_OPTIONS, selected: this.review.selected } : null,
      message: this.draft.status || chatEmptyMessage(bot, grokBotHub) };
    this.maxScrollBack = chatMaxScrollBack(face, view);
    this.scrollBack = Math.min(this.scrollBack, this.maxScrollBack);
    paintChat(image, face, { ...view, scrollBack: this.scrollBack });
  }

  handleInput(event: InputEvent): void {
    switch (event.type) {
      case "scroll-up": case "swipe-up": case "scroll-down": case "swipe-down": {
        if (this.draft.active) return;
        const down = event.type === "scroll-down" || event.type === "swipe-down";
        if (this.review.active) this.review.move(down ? 1 : -1);
        else this.scrollBack = Math.max(0, Math.min(this.maxScrollBack, this.scrollBack + (down ? -SCROLL_ROWS : SCROLL_ROWS)));
        return;
      }
      case "click":
        if (this.draft.active) { this.draft.release(); return; }
        if (this.review.active) {
          if (this.review.selected === 0) {
            const text = this.review.text.trim();
            if (!text) return;
            this.review.discard(); this.notSent = ""; botsChatDraftSetting.set(""); this.send(text);
          } else if (this.review.selected === 1) {
            botsChatDraftSetting.set(this.review.text); this.review.editing = true; this.notSent = "";
            void this.options.actions.startTextSettingEdit(botsChatDraftSetting);
          } else { this.review.discard(); this.notSent = ""; botsChatDraftSetting.set(""); }
          return;
        }
        this.startListening();
        return;
      case "double-click":
        if (this.draft.active) { this.draft.cancel(); return; }
        if (this.review.active) { this.review.discard(); this.notSent = ""; botsChatDraftSetting.set(""); return; }
        shell.yieldFocusToSidebar();
        return;
      default: return;
    }
  }

  menuItems(): MenuItem[] {
    const bot = this.bot;
    const items: MenuItem[] = [];
    if (bot.working) items.push({ label: "Stop", onSelect: (ctx: LayerContext) => { ctx.stack.clearToBase(); void grokBotHub.interrupt(bot.name); } });
    items.push(toggleSettingMenuItem(botsWakeOnReplySetting));
    return items;
  }

  close(): void {
    this.draft.cancel();
    this.review.discard();
    botsChatDraftSetting.set("");
    this.foreground = false;
    this.syncHub();
  }
}

function createBotsWindow(options: InProcessAppOptions): InProcessWindow {
  const layer = new BotsLayer(options);
  activeLayer = layer;
  let unsubscribe = () => {};
  const app = createInProcessWindow({
    ...options,
    appId: "bots", windowId: BOTS_WINDOW_ID, title: BOT_TITLE, iconLetter: "G", icon: "sparkles", closeable: true,
    baseLayer: layer,
    isVoiceCapturing: () => layer.draft.active,
    keepsScreenOn: () => true,
    onSystemMenuOpened: () => layer.draft.cancel(),
    onAppMenuOpened: () => layer.draft.cancel(),
    setScreenOn: (on) => { if (!on) layer.draft.cancel(); layer.setScreenOn(on); },
    setSurfaceVisible: (visible) => { if (!visible) layer.draft.cancel(); options.setSurfaceVisible(visible); },
    onForegroundChanged: (foreground) => layer.setForeground(foreground),
    menuItems: () => layer.menuItems(),
    receiveTextInput: (text) => { if (!layer.draft.active) layer.reviewText(text); },
    onClosed: () => { unsubscribe(); layer.close(); if (activeLayer === layer) activeLayer = null; options.onClosed(); },
  });
  unsubscribe = layer.start(app.requestRender);
  return app;
}
