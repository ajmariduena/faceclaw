import { GrayImage } from "../../graphics/image";
import { getDefaultSmallFont } from "../../graphics/ui-fonts";
import { EvenHubFont } from "../../graphics/evenhub-font";
import { paintChat, chatMaxScrollBack, type Face, type ChatView } from "../../graphics/terminal-painter";
import { ASSISTANT_MODEL_CHOICES, assistantModelLabel, resolveAssistantModel } from "../../assistant/models";
import type { AssistantConversations, ReasoningLevel } from "../../assistant/conversations";
import { anthropicApiKeySetting, assistantBackendSetting, openAiApiKeySetting, openRouterApiKeySetting, aiChatDraftSetting } from "../../ui/dashboard-settings";
import { onSettingsStoreChanged } from "../../native/settings-store";
import type { InputEvent } from "../../ui/gestures";
import type { Layer, LayerContext } from "../../ui/layers";
import type { MenuItem } from "../../ui/menu";
import { WindowMenuLayer } from "../../ui/window-menu";
import { createInProcessWindow, type InProcessAppOptions, type InProcessWindow } from "../../ui/shell/in-process-window";
import { shell } from "../../ui/shell/shell";
import { VoiceDraft } from "./voice-draft";
import { ChatDraft, DRAFT_OPTIONS } from "../../ui/chat-draft";

let activeChatLayer: AiChatLayer | null = null;

/** Call after launching AI Chat; an existing capture or review is never replaced. */
export function startAiChatDictation(): boolean { return activeChatLayer?.startListening() ?? false; }

class AiChatLayer implements Layer {
  readonly acceptsDirectional = true;
  private scrollBack = 0;
  private maxScrollBack = 0;
  private selectedId = "";
  private shownMessages = 0;
  private requestRender = () => {};
  private thinkingAt = 0;
  readonly draft: VoiceDraft;
  readonly review = new ChatDraft();

  constructor(private readonly conversations: AssistantConversations, private readonly options: InProcessAppOptions) {
    this.selectedId = conversations.current().id;
    this.draft = new VoiceDraft(options.actions, () => shell.prepareChatVoiceCapture(),
      () => this.requestRender(), text => this.reviewText(text));
  }
  start(render: () => void): () => void {
    this.requestRender = render;
    const off = this.conversations.onChanged(() => {
      if (this.conversations.current().session?.isTurnActive()) this.thinkingAt ||= Date.now();
      else this.thinkingAt = 0;
      render();
    });
    const offSettings = onSettingsStoreChanged(key => {
      if (key === "aiChat.draft" && this.review.editing) { this.review.text = aiChatDraftSetting.get(); render(); }
    });
    const timer = setInterval(() => { if (this.draft.active || this.thinkingAt) render(); }, 250);
    return () => { off(); offSettings(); clearInterval(timer); };
  }
  startListening(): boolean {
    if (this.draft.active || this.review.active || this.conversations.current().session?.isTurnActive()) return false;
    if (!shell.isAssistantAvailable()) { shell.showAlert("OpenRouter key missing"); return false; }
    void this.draft.start();
    return true;
  }
  reviewText(text: string): void { this.scrollBack = 0; this.review.review(text); this.requestRender(); }
  send(text: string): void { this.scrollBack = 0; shell.sendToAssistant(text, false); }
  paint(ctx: LayerContext): GrayImage {
    const size = ctx.stack.getBaseSize();
    const image = new GrayImage(size.width, size.height);
    const font = getDefaultSmallFont();
    let stock: Face | null = null;
    try { const loaded = EvenHubFont.get(); if (loaded.hasGlyph(65)) stock = loaded; } catch { /* Bundled fallback font below. */ }
    const face: Face = stock ?? { lineHeight: font.lineHeight, measureLine: text => font.measureText(text),
      drawText: (img, x, y, text, value = 255) => img.drawText(font, x, y, text, value) };
    const record = this.conversations.current();
    if (this.selectedId !== record.id) { this.selectedId = record.id; this.scrollBack = 0; this.shownMessages = 0; this.review.discard(); }
    const transcript = record.session?.transcript ?? record.history?.transcript ?? [];
    const lines = transcript.filter(entry => entry.text).map(entry => ({ role: entry.role, text: entry.text, action: entry.action }));
    if (this.scrollBack > 0 && lines.length > this.shownMessages) this.scrollBack += lines.length - this.shownMessages;
    this.shownMessages = lines.length;
    if (this.draft.active || this.review.active) lines.push({ role: "user", text: this.draft.text || this.review.text || "…", action: false });
    const ms = Math.max(0, Date.now() - this.draft.startedAt);
    const elapsed = `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
    const footer = this.draft.active ? { left: this.draft.phase === "finishing" ? "· Finishing" : "· Listening", right: elapsed } :
      this.thinkingAt ? { left: "· Thinking", right: `${((Date.now() - this.thinkingAt) / 1000).toFixed(1)}s` } :
      record.session?.status ? { left: `· ${record.session.status}`, right: "" } :
      { left: "· AI Chat", right: assistantModelLabel(record.model) };
    const view: ChatView = { lines, scrollBack: this.scrollBack, footer,
      permission: this.review.active ? { question: this.review.editing ? "Edit on phone" : "Draft", options: DRAFT_OPTIONS, selected: this.review.selected } : null,
      message: record.session?.status || this.draft.status || "Ready" };
    this.maxScrollBack = chatMaxScrollBack(face, view);
    paintChat(image, face, view);
    return image;
  }
  handleInput(event: InputEvent): void {
    switch (event.type) {
      case "scroll-up": case "swipe-up": case "scroll-down": case "swipe-down": {
        if (this.draft.active) return;
        const down = event.type === "scroll-down" || event.type === "swipe-down";
        if (this.review.active) this.review.move(down ? 1 : -1);
        else this.scrollBack = Math.max(0, Math.min(this.maxScrollBack, this.scrollBack + (down ? -1 : 1)));
        return;
      }
      case "click":
        if (this.draft.active) { this.draft.release(); return; }
        if (this.review.active) {
          if (this.review.selected === 0) {
            const text = this.review.text.trim();
            if (!text || this.conversations.current().session?.isTurnActive()) return;
            if (!shell.isAssistantAvailable()) { shell.showAlert("OpenRouter key missing"); return; }
            this.review.discard(); aiChatDraftSetting.set(""); this.send(text);
          } else if (this.review.selected === 1) {
            aiChatDraftSetting.set(this.review.text); this.review.editing = true;
            void this.options.actions.startTextSettingEdit(aiChatDraftSetting);
          } else { this.review.discard(); aiChatDraftSetting.set(""); }
          return;
        }
        this.startListening();
        return;
      case "double-click":
        if (this.draft.active) { this.draft.cancel(); return; }
        if (this.review.active) { this.review.discard(); aiChatDraftSetting.set(""); return; }
        shell.yieldFocusToSidebar(); return;
      default: return;
    }
  }
  menuItems(): MenuItem[] {
    const record = this.conversations.current();
    const busy = () => this.review.active || this.draft.active || Boolean(record.session?.isTurnActive());
    const external = assistantBackendSetting.get() === "external";
    const submenu = (ctx: LayerContext, title: string, items: MenuItem[]) => ctx.stack.push(new WindowMenuLayer(title, items, true));
    return [
      ...(external ? [{ label: "Sessions and model managed by bridge", disabled: true, onSelect: () => {} }] : []),
      { label: "New session", disabled: () => external || busy(), onSelect: (ctx) => {
        if (this.conversations.create()) ctx.stack.clearToBase();
      } },
      { label: "Switch session", disabled: () => external || busy(), onSelect: (ctx) => submenu(ctx, "Sessions",
        [...this.conversations.list()].reverse().map((item) => ({
          label: `${item.id === record.id ? "✓ " : ""}${this.conversations.title(item)}`,
          onSelect: (pickCtx) => { if (this.conversations.select(item.id)) pickCtx.stack.clearToBase(); },
        }))) },
      { label: `Model: ${assistantModelLabel(record.model)}`, disabled: () => external || busy(), onSelect: (ctx) => submenu(ctx, "Model",
        ASSISTANT_MODEL_CHOICES.map((model) => ({
          label: `${model === record.model ? "✓ " : ""}${assistantModelLabel(model)}`,
          disabled: () => !this.conversations.available(model, record.reasoning),
          onSelect: (pickCtx) => { if (this.conversations.configure(model, record.reasoning)) pickCtx.stack.clearToBase(); },
        }))) },
      { label: `Reasoning: ${record.reasoning}`, disabled: () => {
        const llm = resolveAssistantModel(record.model, { anthropic: anthropicApiKeySetting.get(), openai: openAiApiKeySetting.get(), openrouter: openRouterApiKeySetting.get() });
        return external || busy() || !llm?.effort;
      }, onSelect: (ctx) => submenu(ctx, "Reasoning", (["default", "low", "medium", "high"] as ReasoningLevel[]).map((reasoning) => ({
        label: `${reasoning === record.reasoning ? "✓ " : ""}${reasoning === "default" ? "Model default" : reasoning}`,
        onSelect: (pickCtx) => { if (this.conversations.configure(record.model, reasoning)) pickCtx.stack.clearToBase(); },
      }))) },
      ...(record.session?.isTurnActive() ? [{ label: "Cancel response", onSelect: (ctx: LayerContext) => {
        record.session?.cancel(); ctx.stack.clearToBase();
      } }] : []),
    ];
  }
}

export function createAiChatWindow(options: InProcessAppOptions): InProcessWindow {
  const layer = new AiChatLayer(shell.getAssistantConversations(), options);
  activeChatLayer = layer;
  let unsubscribe = () => {};
  const app = createInProcessWindow({
    ...options,
    appId: "ai-chat", windowId: "ai-chat", title: "AI Chat", iconLetter: "AI", icon: "message-circle", closeable: true,
    baseLayer: layer,
    isVoiceCapturing: () => layer.draft.active,
    onSystemMenuOpened: () => layer.draft.cancel(),
    onAppMenuOpened: () => layer.draft.cancel(),
    setScreenOn: (on) => { if (!on) layer.draft.cancel(); },
    setSurfaceVisible: (visible) => { if (!visible) layer.draft.cancel(); options.setSurfaceVisible(visible); },
    menuItems: () => layer.menuItems(),
    receiveTextInput: (text) => { if (!layer.draft.active) layer.reviewText(text); },
    onClosed: () => { unsubscribe(); layer.draft.cancel(); layer.review.discard(); aiChatDraftSetting.set(""); if (activeChatLayer === layer) activeChatLayer = null; options.onClosed(); },
  });
  unsubscribe = layer.start(app.requestRender);
  return app;
}
