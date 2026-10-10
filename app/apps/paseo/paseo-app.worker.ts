/**
 * Paseo app, hosted in its own worker thread: a glasses client for the
 * user's Paseo daemon (the coding-agent server), reached through the Paseo
 * relay with end-to-end encryption from the pairing link.
 *
 * One window ("paseo:main") moves between screens, all in Even's
 * terminal-mode look (app/apps/paseo/paseo-painter.ts):
 * - list: the daemon's agents in the sidebar's buckets (Needs input, Failed,
 *   Ready to review, Working, Done); ring moves, tap opens, double tap goes
 *   home.
 * - chat: the user's messages and the agent's replies, each condensed to one
 *   line by the daemon's glance summary (first sentence until it arrives).
 *   Tap dictates a reply through the glasses mic and the daemon's
 *   speech-to-text; with a permission pending, ring picks and tap answers.
 *   Tap-then-hold has Stop and Archive; double tap returns to the list.
 * - pair: the `paseo daemon pair` link, typed into the phone app's editor.
 *
 * The connection lives while the window is open and, with no window, while a
 * daemon is paired (the home's Paseo card shows the two latest updates from
 * the snapshot this worker publishes). Frames are painted here and submitted
 * straight to the compositor from this worker's thread.
 */
import "@nativescript/core/globals";
import "./paseo-polyfills";
import { createEncryptedTransport, createWebSocketTransportFactory } from "./vendor/paseo-transport";
import { finishWorkerShutdown } from "../../ui/shell/worker-lifecycle";
import { GrayImage } from "../../graphics/image";
import { flattenPlanesWithDraws, planesFingerprint, type Plane } from "../../graphics/plane";
import { prepareFrameDraws } from "../../graphics/glyph-wire";
import { terminalFace } from "../../ui/terminal-face";
import * as frameTimings from "../../native/frame-timings";
import { getActiveDisplay } from "../../native/active-display";
import { onSettingsStoreChanged } from "../../native/settings-store";
import { createGlassesWebSocket } from "./paseo-socket";
import { playWorkerBuzzerSequence } from "../../native/worker-buzzer";
import { buildSoundSequencePayload } from "../../ui/sound-effects";
import { paseoChatDraftSetting, paseoPairingLinkSetting, paseoWakeOnAttentionSetting, toggleSettingMenuItem } from "../../ui/dashboard-settings";
import { ChatDraft, DRAFT_OPTIONS } from "../../ui/chat-draft";
import { submenuItem, type MenuItem } from "../../ui/menu";
import { WindowMenu, WindowMenuLayer } from "../../ui/window-menu";
import type { WorkerAppMessage, WorkerAppReply } from "../../ui/shell/worker-window";
import type { InputEvent } from "../../ui/gestures";
import { errorMessage, PaseoDaemonClient, type GlanceItem } from "./paseo-client";
import { buildGlanceSnapshot, PASEO_GLANCE_STATE_KEY } from "./paseo-glance";
import {
  agentBucket,
  agentTitle,
  BUCKET_LABELS,
  chatEntries,
  chatEntryFromTimeline,
  fallbackLine,
  formatClock,
  isListedAgent,
  formatDuration,
  plainText,
  sectionAgents,
  sectionCounts,
  upsertEntry,
  LOCAL_ENTRY_PREFIX,
  type AgentSnapshot,
  type Bucket,
  type ChatEntry,
  type PermissionRequest,
} from "./paseo-model";
import {
  chatMaxScrollBack,
  listScrollTop,
  paintChat,
  paintChoice,
  paintList,
  paintPair,
  paintPlanSteps,
  type ChatLine,
  type ChatView,
  type ChoiceView,
  type Face,
  type ListRow,
  type ListView,
} from "./paseo-painter";
import {
  answerQuestionByText,
  chooseQuestionRow,
  currentQuestion,
  moveQuestionCursor,
  parseQuestionFormQuestions,
  planActionLabel,
  planActionResponse,
  planActions,
  planSteps,
  planSummary,
  planText,
  questionDismissResponse,
  questionRows,
  questionSubmitResponse,
  requestKind,
  startQuestionFlow,
  type PermissionResponse,
  type QuestionFlow,
} from "./paseo-requests";
import { parsePairingInput, pairingLabel, type PaseoPairing } from "./paseo-pairing";
import { hasPaseoBackgroundWork, loadPairing, PASEO_PAIRING_KEY, savePairing } from "./paseo-store";

declare const global: any;

const APP_TITLE = "Paseo";
/** Storage key of paseoPairingLinkSetting (the phone editor types into it). */
const PAIRING_DRAFT_KEY = "paseo.pairingDraft";
/** Coalesce stream-driven repaints: agents can update several times a second, and frames cost BLE bandwidth. */
const DATA_RENDER_COALESCE_MS = 150;
/** Coalesce home-card snapshots (the card shows ages, not live text). */
const PUBLISH_COALESCE_MS = 1_500;
/** How long a transient status ("Sent", an error) stays in the footer. */
const NOTICE_MS = 5_000;
const TIMELINE_TAIL = 40;
const GLANCE_TAIL = 8;
const DICTATION_FORMAT = "audio/pcm;rate=16000;bits=16";
/** Mic packets buffered before the daemon acknowledges the dictation start. */
const DICTATION_PREROLL_MAX = 60;
const PERMISSION_OPTIONS = ["Allow once", "Always allow for this session", "Deny"] as const;

// ---------------------------------------------------------------------------
// State

type Screen = { kind: "list" } | { kind: "chat"; agentId: string } | { kind: "pair" };

type AppWindow = {
  windowId: string;
  surfaceId: string;
  viewportWidth: number;
  viewportHeight: number;
  foreground: boolean;
  focused: boolean;
  menu: WindowMenu | null;
  lastSubmittedFingerprint: string;
  renderTimer: ReturnType<typeof setTimeout> | null;
};

type ChatState = {
  agentId: string;
  entries: ChatEntry[];
  loaded: boolean;
  error: string;
  scrollBack: number;
  /** ">" among the permission options or plan actions. */
  permissionIndex: number;
  /** The question form being answered (per request id). */
  flow: QuestionFlow | null;
  /** Reading the plan's steps instead of the approval box. */
  planSteps: boolean;
  planIndex: number;
  /** Where the shell voice dialog's text goes (the glasses mic path carries its own target). */
  textTarget: "message" | "other";
};

type Dictation = {
  id: string;
  state: "starting" | "listening" | "finishing";
  seq: number;
  startedMs: number;
  partial: string;
  preroll: string[];
  micActive: boolean;
  /** Where the final text goes: a message to the agent, or the "Other…" answer of a question. */
  target: "message" | "other";
};

let window: AppWindow | null = null;
let screen: Screen = { kind: "list" };
let screenOn = true;
let client: PaseoDaemonClient | null = null;
let clientUnsubscribers: Array<() => void> = [];
const agents = new Map<string, AgentSnapshot>();
let agentsLoaded = false;
let chat: ChatState | null = null;
let dictation: Dictation | null = null;
const draft = new ChatDraft();
let draftTarget: Dictation["target"] = "message";
let sendingDraft = false;
let listSelectionKey: string | null = null;
let listTop = 0;
let notice: { text: string; untilMs: number } | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let busyText = "";
let screenError = "";
/** Glance lines per message id (summaries are per message, so one cache serves every agent). */
const summaries = new Map<string, string>();
const summariesPending = new Set<string>();
/** Latest assistant line per agent for the home card, with the agent update it was fetched for. */
const glanceLines = new Map<string, { updatedAt: string; line: string }>();
const glanceFetching = new Set<string>();
/** Last seen bucket per agent, for attention alerts. */
const knownStatus = new Map<string, { bucket: Bucket; permissionId: string | null }>();
let attentionBaselined = false;

function post(message: WorkerAppReply): void {
  global.postMessage(message);
}

function face(): Face {
  return terminalFace();
}

// ---------------------------------------------------------------------------
// Socket adapter (OkHttp, text frames) for the vendored transport


// ---------------------------------------------------------------------------
// Worker messages

// The host queues messages until this arrives: posts to a worker whose bundle
// is still evaluating can be silently dropped (see WorkerAppHost).
post({ type: "worker-ready" });

global.onmessage = (event: { data: WorkerAppMessage }) => {
  const message = event.data;
  switch (message.type) {
    case "check-idle":
      reportIdle();
      break;
    case "shutdown":
      stopClient();
      finishWorkerShutdown();
      break;
    case "open-window":
      window = {
        windowId: message.windowId,
        surfaceId: message.surfaceId,
        viewportWidth: message.viewport.width,
        viewportHeight: message.viewport.height,
        foreground: false,
        focused: false,
        menu: null,
        lastSubmittedFingerprint: "",
        renderTimer: null,
      };
      screen = { kind: "list" };
      syncClient();
      updateTicker();
      break;
    case "resize-window":
      if (!window || window.windowId !== message.windowId) break;
      window.viewportWidth = message.viewport.width;
      window.viewportHeight = message.viewport.height;
      window.menu?.resize(message.viewport);
      window.lastSubmittedFingerprint = "";
      render();
      break;
    case "close-window":
      if (!window || window.windowId !== message.windowId) break;
      cancelDictation();
      leaveScreenSideEffects();
      window.menu?.close();
      if (window.renderTimer) clearTimeout(window.renderTimer);
      window = null;
      closeChat();
      screen = { kind: "list" };
      if (!hasPaseoBackgroundWork()) stopClient();
      updateTicker();
      break;
    case "input":
      if (!window || window.windowId !== message.windowId) {
        frameTimings.finishFrame(message.frameId, "discarded: unknown paseo window");
        break;
      }
      window.focused = message.focused;
      inferForeground(message.focused);
      frameTimings.logFrame(message.frameId, `input received in ${message.windowId} worker`);
      handleInput(window, message.event as InputEvent, message.frameId);
      break;
    case "text-input":
      if (window && window.windowId === message.windowId) handleTextInput(message.text.trim());
      break;
    case "render":
      if (!window || window.windowId !== message.windowId) break;
      window.focused = message.focused;
      inferForeground(message.focused);
      renderNow();
      break;
    case "foreground":
      if (!window || window.windowId !== message.windowId) break;
      window.foreground = message.foreground;
      window.focused = message.focused;
      if (!window.foreground && dictation) cancelDictation();
      updateTicker();
      if (window.foreground) renderNow();
      break;
    case "screen":
      screenOn = message.on;
      if (!screenOn && dictation) cancelDictation();
      updateTicker();
      if (screenOn) renderNow();
      break;
    case "raw-mic-state":
      handleRawMicState(message.active, message.reason);
      break;
    case "raw-pcm":
      handleRawPcm(message.pcm);
      break;
    case "tool-call":
      post({ type: "tool-result", callId: message.callId, result: { ok: false, error: "Paseo has no assistant tools." } });
      break;
    case "input-focus":
    case "navigation-sensors":
      break;
  }
};

/** Input and render messages only reach the foreground window; backstops a lost "foreground". */
function inferForeground(focused: boolean): void {
  if (!focused || !window || window.foreground) return;
  window.foreground = true;
  updateTicker();
}

onSettingsStoreChanged((key) => {
  if (key === "paseo.chatDraft" && draft.editing) { draft.text = paseoChatDraftSetting.get(); render(); }
  if (key === PASEO_PAIRING_KEY) {
    syncClient();
    if (!window) reportIdle();
    render();
  } else if (key === PAIRING_DRAFT_KEY) {
    // Live keystrokes from the phone editor.
    if (screen.kind === "pair") render();
  } else if (key.startsWith("paseo.")) {
    render();
  }
});

// ---------------------------------------------------------------------------
// Client

function syncClient(): void {
  const stored = loadPairing();
  if (!stored) {
    stopClient();
    return;
  }
  if (!client) {
    const created = new PaseoDaemonClient(stored, {
      webSocketFactory: (url) => createGlassesWebSocket(url),
      adapters: { createWebSocketTransportFactory, createEncryptedTransport },
      clientId: "faceclaw-glasses",
      appVersion: "faceclaw",
      log: (message) => console.log(message),
    });
    client = created;
    clientUnsubscribers = [
      created.onChange(() => onClientChanged(created)),
      created.on("agent_update", (message) => onAgentUpdate(message.payload)),
      created.on("agent_stream", (message) => onAgentStream(message.payload)),
      created.on("glance.summary", (message) => onGlanceSummary(message.payload)),
      created.on("dictation_stream_partial", (message) => {
        if (dictation && message.payload?.dictationId === dictation.id) {
          dictation.partial = String(message.payload.text ?? "");
          scheduleRender();
        }
      }),
    ];
  } else {
    client.updatePairing(stored);
  }
  client.start();
  schedulePublish();
}

function stopClient(): void {
  if (!client) return;
  client.stop();
  for (const unsubscribe of clientUnsubscribers) unsubscribe();
  clientUnsubscribers = [];
  client = null;
  agents.clear();
  agentsLoaded = false;
  attentionBaselined = false;
  knownStatus.clear();
  glanceLines.clear();
  schedulePublish();
}

/** Let the host shut this worker down once neither a window nor the home card needs it. */
function reportIdle(): void {
  if (!window && !hasPaseoBackgroundWork()) post({ type: "worker-idle" });
}

function onClientChanged(current: PaseoDaemonClient): void {
  if (current !== client) return;
  if (current.connected) void bootstrap(current);
  else agentsLoaded = false;
  schedulePublish();
  scheduleRender();
}

/** A fresh connection: reload the agent list (subscribed) and whatever chat is open. */
async function bootstrap(current: PaseoDaemonClient): Promise<void> {
  try {
    const page = await current.fetchAgents({ subscribe: true });
    if (current !== client || !current.connected) return;
    agents.clear();
    for (const entry of page.entries) {
      const agent = entry.agent as AgentSnapshot;
      if (agent?.id) agents.set(agent.id, agent);
    }
    agentsLoaded = true;
    for (const agent of agents.values()) noteAttention(agent);
    attentionBaselined = true;
    if (chat) void loadChat(chat.agentId);
    schedulePublish();
    scheduleRender();
  } catch (error) {
    console.warn(`paseo: agent list failed: ${errorMessage(error)}`);
    showNotice(`Can't list agents: ${errorMessage(error)}`);
  }
}

function onAgentUpdate(payload: any): void {
  if (!payload) return;
  if (payload.kind === "upsert" && payload.agent?.id) {
    const agent = payload.agent as AgentSnapshot;
    agents.set(agent.id, agent);
    noteAttention(agent);
    if (chat?.agentId === agent.id) syncPendingRequest(agent);
    if (window) post({ type: "set-title", windowId: window.windowId, title: screen.kind === "chat" ? chatTitle() : APP_TITLE });
  } else if (typeof payload.agentId === "string") {
    agents.delete(payload.agentId);
    knownStatus.delete(payload.agentId);
    glanceLines.delete(payload.agentId);
    if (chat?.agentId === payload.agentId && screen.kind === "chat") {
      showNotice("The agent was removed.");
      setScreen({ kind: "list" });
    }
  }
  schedulePublish();
  scheduleRender();
}

function onAgentStream(payload: any): void {
  if (!payload || !chat || payload.agentId !== chat.agentId) return;
  const event = payload.event;
  if (event?.type !== "timeline") return;
  const entry = chatEntryFromTimeline({ item: event.item, seq: payload.seq });
  if (!entry) return;
  if (upsertEntry(chat.entries, entry)) {
    chat.scrollBack = 0;
    requestSummaries(chat.agentId, chat.entries);
    scheduleRender();
  }
}

// ---------------------------------------------------------------------------
// Attention: permissions and finished runs

const NEEDS_BUZZ = buildSoundSequencePayload([
  { freq: 1400, ms: 70 },
  { freq: 1, duty: 0, ms: 60 },
  { freq: 1800, ms: 90 },
]);
const DONE_BUZZ = buildSoundSequencePayload([{ freq: 1200, ms: 90 }]);

function noteAttention(agent: AgentSnapshot): void {
  const bucket = agentBucket(agent);
  const permissionId = agent.pendingPermissions?.[0]?.id ?? null;
  const previous = knownStatus.get(agent.id);
  knownStatus.set(agent.id, { bucket, permissionId });
  if (!attentionBaselined || !previous || !isListedAgent(agent)) return;
  const needsUser = bucket === "needs" && permissionId !== null && permissionId !== previous.permissionId;
  const finished = previous.bucket === "working" && (bucket === "review" || bucket === "failed" || bucket === "done");
  if (!needsUser && !finished) return;
  const viewingAgent = Boolean(window?.foreground && screenOn && screen.kind === "chat" && chat?.agentId === agent.id);
  if (window && !(window.foreground && screenOn)) post({ type: "set-attention", windowId: window.windowId, attention: true });
  if (!paseoWakeOnAttentionSetting.get()) return;
  if (!viewingAgent) buzz(needsUser ? NEEDS_BUZZ : DONE_BUZZ);
  if (window && !screenOn) {
    // Show the list with the agent selected rather than wherever we were.
    if (screen.kind !== "chat") setScreen({ kind: "list" });
    listSelectionKey = agent.id;
    // The shell drops this unless the glasses are actually asleep.
    post({ type: "wake-window", windowId: window.windowId });
  }
}

function buzz(payload: Uint8Array): void {
  try {
    playWorkerBuzzerSequence(payload);
  } catch (error) {
    console.warn(`paseo buzz failed: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Home card snapshot

let publishTimer: ReturnType<typeof setTimeout> | null = null;
let lastPublished = "";

function schedulePublish(): void {
  if (publishTimer) return;
  publishTimer = setTimeout(() => {
    publishTimer = null;
    publishGlanceSnapshot();
  }, PUBLISH_COALESCE_MS);
}

function publishGlanceSnapshot(): void {
  const snapshot = buildGlanceSnapshot(
    {
      configured: loadPairing() !== null,
      connected: Boolean(client?.connected && agentsLoaded),
      status: client ? connectionStatus(client) : "",
    },
    agents.values(),
    (agent) => agentGlanceLine(agent),
  );
  refreshGlanceLines(snapshot.updates.map((update) => update.agentId));
  const encoded = JSON.stringify(snapshot);
  if (encoded === lastPublished) return;
  lastPublished = encoded;
  post({ type: "publish-state", key: PASEO_GLANCE_STATE_KEY, state: snapshot });
}

function connectionStatus(current: PaseoDaemonClient): string {
  switch (current.phase) {
    case "connected":
      return agentsLoaded ? "" : "Loading…";
    case "connecting":
      return "Connecting…";
    case "retrying":
      return "Mac unreachable";
    case "idle":
      return "Disconnected";
  }
}

function agentGlanceLine(agent: AgentSnapshot): string {
  const request = agent.pendingPermissions?.[0];
  if (request) {
    const summary = requestKind(request) === "question" ? summaries.get(`permission:${request.id}`) : undefined;
    return summary ?? permissionQuestion(agent, request);
  }
  const known = glanceLines.get(agent.id);
  if (known) return known.line;
  if (chat?.agentId === agent.id) {
    const last = [...chat.entries].reverse().find((entry) => entry.role === "assistant");
    if (last) return lineFor(last);
  }
  return "";
}

/** Fetch the latest reply of the agents the card shows, once per agent update. */
function refreshGlanceLines(agentIds: string[]): void {
  const current = client;
  if (!current?.connected) return;
  for (const agentId of agentIds) {
    const agent = agents.get(agentId);
    if (!agent || agent.pendingPermissions?.length) continue;
    if (glanceLines.get(agentId)?.updatedAt === agent.updatedAt || glanceFetching.has(agentId)) continue;
    glanceFetching.add(agentId);
    const updatedAt = agent.updatedAt;
    void current
      .fetchAgentTimeline(agentId, GLANCE_TAIL)
      .then(async (page) => {
        const entries = chatEntries(page.entries);
        const last = [...entries].reverse().find((entry) => entry.role === "assistant");
        if (!last) {
          glanceLines.set(agentId, { updatedAt, line: "" });
          return;
        }
        await summarize(agentId, [last]);
        glanceLines.set(agentId, { updatedAt, line: lineFor(last) });
      })
      .catch((error) => console.warn(`paseo: glance line for ${agentId} failed: ${errorMessage(error)}`))
      .then(() => {
        glanceFetching.delete(agentId);
        if (current === client) schedulePublish();
      });
  }
}

// ---------------------------------------------------------------------------
// Summaries

function lineFor(entry: ChatEntry): string {
  return summaries.get(entry.id) ?? fallbackLine(entry.text);
}

/** Ask the daemon for the lines this chat lacks (newest first, at most 20 per request). */
function requestSummaries(agentId: string, entries: readonly ChatEntry[]): void {
  const missing = [...entries].reverse().filter((entry) => !summaries.has(entry.id) && !summariesPending.has(entry.id)).slice(0, 20);
  if (!missing.length) return;
  void summarize(agentId, missing).then(() => {
    if (chat?.agentId === agentId) scheduleRender();
    schedulePublish();
  });
}

/** Lines the daemon precomputed when a turn finished or the agent asked something. */
function onGlanceSummary(payload: any): void {
  const agentId = typeof payload?.agentId === "string" ? payload.agentId : "";
  if (!agentId || !Array.isArray(payload.items)) return;
  for (const item of payload.items) {
    const line = typeof item?.line === "string" ? item.line.trim() : "";
    if (typeof item?.id !== "string" || !line) continue;
    summaries.set(item.id, line);
    if (item.role === "assistant" && !item.id.startsWith("permission:")) {
      glanceLines.set(agentId, { updatedAt: agents.get(agentId)?.updatedAt ?? "", line });
    }
  }
  if (chat?.agentId === agentId) scheduleRender();
  schedulePublish();
}

async function summarize(agentId: string, entries: readonly ChatEntry[]): Promise<void> {
  const current = client;
  if (!current?.connected || !current.supportsGlanceSummary) return;
  const items: GlanceItem[] = entries.filter((entry) => !summaries.has(entry.id)).map((entry) => ({ id: entry.id, role: entry.role, text: entry.text }));
  if (!items.length) return;
  for (const item of items) summariesPending.add(item.id);
  try {
    for (const line of await current.summarizeForGlance(items, agentId)) {
      if (typeof line?.line === "string" && line.line.trim()) summaries.set(line.id, line.line.trim());
    }
  } catch (error) {
    console.warn(`paseo: glance summary failed: ${errorMessage(error)}`);
  } finally {
    for (const item of items) summariesPending.delete(item.id);
  }
}

// ---------------------------------------------------------------------------
// Screens

function setScreen(next: Screen): void {
  leaveScreenSideEffects();
  if (next.kind !== "chat") closeChat();
  screen = next;
  busyText = "";
  screenError = "";
  if (window) post({ type: "set-title", windowId: window.windowId, title: next.kind === "chat" ? chatTitle() : APP_TITLE });
  updateTicker();
}

/** Undo whatever the current screen started (the phone editor, a dictation). */
function leaveScreenSideEffects(): void {
  if (screen.kind === "pair") {
    paseoPairingLinkSetting.set("");
    post({ type: "end-text-setting-edit" });
  }
  if (dictation) cancelDictation();
}

function goBack(frameId: number): void {
  if (dictation) { cancelDictation(); renderNow(frameId); return; }
  if (draft.active) { draft.discard(); paseoChatDraftSetting.set(""); renderNow(frameId); return; }
  switch (screen.kind) {
    case "list":
      frameTimings.finishFrame(frameId, "discarded: paseo yielded focus");
      post({ type: "yield-focus", windowId: window!.windowId });
      return;
    case "pair":
    case "chat":
      setScreen({ kind: "list" });
      break;
  }
  renderNow(frameId);
}

function openChat(agentId: string): void {
  closeChat();
  chat = { agentId, entries: [], loaded: false, error: "", scrollBack: 0, permissionIndex: 0, flow: null, planSteps: false, planIndex: 0, textTarget: "message" };
  const agent = agents.get(agentId);
  if (agent) syncPendingRequest(agent);
  setScreen({ kind: "chat", agentId });
  listSelectionKey = agentId;
  if (window) post({ type: "set-attention", windowId: window.windowId, attention: false });
  void loadChat(agentId);
}

async function loadChat(agentId: string): Promise<void> {
  const current = client;
  if (!current?.connected || chat?.agentId !== agentId) return;
  try {
    await current.setTimelineSubscription([agentId]);
    const page = await current.fetchAgentTimeline(agentId, TIMELINE_TAIL);
    if (chat?.agentId !== agentId) return;
    const entries = chatEntries(page.entries);
    // Keep anything that streamed in while the tail was loading.
    for (const entry of chat.entries) upsertEntry(entries, entry);
    chat.entries = entries;
    chat.loaded = true;
    chat.error = "";
    requestSummaries(agentId, entries);
  } catch (error) {
    if (chat?.agentId !== agentId) return;
    chat.error = errorMessage(error);
  }
  scheduleRender();
}

function closeChat(): void {
  draft.discard(); paseoChatDraftSetting.set("");
  if (!chat) return;
  chat = null;
  const current = client;
  if (current?.connected) void current.setTimelineSubscription([]).catch(() => {});
}

function chatAgent(): AgentSnapshot | null {
  return chat ? (agents.get(chat.agentId) ?? null) : null;
}

function chatTitle(): string {
  const agent = chatAgent();
  return agent ? agentTitle(agent) : "Agent";
}

function showNotice(text: string): void {
  notice = { text, untilMs: Date.now() + NOTICE_MS };
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    noticeTimer = null;
    notice = null;
    render();
  }, NOTICE_MS);
  render();
}

// ---------------------------------------------------------------------------
// Input

function windowMenu(win: AppWindow): WindowMenu {
  win.menu ??= new WindowMenu({
    windowId: win.windowId,
    post,
    title: () => (screen.kind === "chat" ? chatTitle() : APP_TITLE),
    items: () => menuItems(),
    size: { width: win.viewportWidth, height: win.viewportHeight },
    paintBase: () => paintContent(win),
    isFocused: () => win.focused,
  });
  return win.menu;
}

function handleInput(win: AppWindow, event: InputEvent, frameId: number): void {
  if (win.menu?.isOpen()) {
    void win.menu
      .handleInput(event)
      .catch((error) => console.error(`paseo menu input failed: ${error}`))
      .then(() => renderNow(frameId));
    return;
  }
  if (event.type === "short-then-long-press") {
    windowMenu(win).open();
    renderNow(frameId);
    return;
  }
  if (event.type === "double-click") {
    goBack(frameId);
    return;
  }
  switch (screen.kind) {
    case "list":
      handleListInput(event, frameId);
      return;
    case "chat":
      handleChatInput(event, frameId);
      return;
    case "pair":
      if (event.type === "click" && !busyText) {
        void pairFromDraft();
        renderNow(frameId);
        return;
      }
      break;
  }
  frameTimings.finishFrame(frameId, "discarded: paseo ignored input");
}

function handleListInput(event: InputEvent, frameId: number): void {
  const view = listView();
  const agentRows = view.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind === "agent");
  if (event.type === "click") {
    if (!loadPairing()) {
      beginPairing();
      renderNow(frameId);
      return;
    }
    const selected = view.rows[view.selected];
    if (selected?.kind === "agent") {
      openChat(selected.key);
      renderNow(frameId);
      return;
    }
    frameTimings.finishFrame(frameId, "discarded: paseo list has nothing to open");
    return;
  }
  if (event.type !== "scroll-up" && event.type !== "scroll-down") {
    frameTimings.finishFrame(frameId, "discarded: paseo list ignored input");
    return;
  }
  const position = agentRows.findIndex(({ index }) => index === view.selected);
  const next = Math.min(agentRows.length - 1, Math.max(0, position + (event.type === "scroll-down" ? 1 : -1)));
  const target = agentRows[next];
  if (target) listSelectionKey = (target.row as Extract<ListRow, { kind: "agent" }>).key;
  renderNow(frameId);
}

function handleChatInput(event: InputEvent, frameId: number): void {
  const current = chat;
  if (!current) {
    frameTimings.finishFrame(frameId, "discarded: paseo no chat");
    return;
  }
  const agent = chatAgent();
  const request = agent?.pendingPermissions?.[0] ?? null;
  const kind = request ? requestKind(request) : null;
  switch (event.type) {
    case "scroll-up":
    case "scroll-down": {
      const down = event.type === "scroll-down";
      if (dictation) {
        frameTimings.finishFrame(frameId, "discarded: paseo dictating");
        return;
      }
      if (draft.active) { draft.move(down ? 1 : -1); }
      else if (kind === "question" && current.flow) {
        moveQuestionCursor(current.flow, down ? 1 : -1);
      } else if (kind === "plan" && request) {
        movePlanCursor(current, planSteps(planText(request)).length, planActions(request).length, down);
      } else if (kind === "permission") {
        current.permissionIndex = Math.max(0, Math.min(PERMISSION_OPTIONS.length - 1, current.permissionIndex + (down ? 1 : -1)));
      } else {
        const max = chatMaxScrollBack(face(), chatView());
        current.scrollBack = Math.min(max, Math.max(0, current.scrollBack + (down ? -1 : 1)));
      }
      renderNow(frameId);
      return;
    }
    case "click":
      if (dictation) {
        frameTimings.finishFrame(frameId, "discarded: paseo finishing dictation");
        void finishDictation();
        return;
      }
      if (draft.active) {
        if (sendingDraft) { renderNow(frameId); return; }
        if (draft.selected === 0 && draft.text.trim()) {
          const text = draft.text.trim();
          if (draftTarget === "other") { draft.discard(); deliverTextAnswer(text); }
          else if (client?.connected) {
            sendingDraft = true;
            void sendMessage(current.agentId, text).then(sent => {
              sendingDraft = false;
              if (sent && chat === current && draft.text.trim() === text) {
                draft.discard(); paseoChatDraftSetting.set("");
                upsertEntry(current.entries, { id: `${LOCAL_ENTRY_PREFIX}${Date.now()}`, role: "user", text });
              }
              render();
            });
          } else showNotice("Not connected to Paseo.");
        } else if (draft.selected === 1) {
          paseoChatDraftSetting.set(draft.text); draft.editing = true;
          post({ type: "start-text-setting-edit", settingId: paseoChatDraftSetting.id });
        } else if (draft.selected === 2) { draft.discard(); paseoChatDraftSetting.set(""); }
        renderNow(frameId); return;
      }
      if (request && agent) {
        if (kind === "question" && current.flow) {
          const action = chooseQuestionRow(current.flow);
          if (action.type === "dictate") {
            frameTimings.finishFrame(frameId, "discarded: paseo dictating an answer");
            void startDictation("other");
            return;
          }
          if (action.type === "submit") submitQuestions(agent, request, current.flow);
        } else if (kind === "plan") {
          if (current.planSteps) current.planSteps = false;
          else {
            const actions = planActions(request);
            const action = actions[Math.min(current.permissionIndex, actions.length - 1)];
            if (action) respond(agent, request, planActionResponse(action), action.behavior === "allow" ? "Approved" : "Kept planning");
          }
        } else answerPermission(agent, request, current.permissionIndex);
        renderNow(frameId);
        return;
      }
      frameTimings.finishFrame(frameId, "discarded: paseo starting dictation");
      void startDictation("message");
      return;
    default:
      frameTimings.finishFrame(frameId, "discarded: paseo chat ignored input");
  }
}

function handleTextInput(text: string): void {
  if (!text) return;
  switch (screen.kind) {
    case "pair":
      paseoPairingLinkSetting.set(text);
      render();
      return;
    case "chat":
      if (chat?.textTarget === "other") {
        chat.textTarget = "message";
        draftTarget = "other"; draft.review(text);
      } else if (chat) { draftTarget = "message"; draft.review(text); }
      render();
      return;
    default:
      showNotice("Open an agent to send it a message.");
  }
}

async function sendMessage(agentId: string, text: string): Promise<boolean> {
  const current = client;
  if (!current?.connected) {
    showNotice("Not connected to Paseo.");
    return false;
  }
  if (chat?.agentId === agentId) chat.scrollBack = 0;
  showNotice("Sending…");
  try {
    const disposition = await current.sendAgentMessage(agentId, text);
    showNotice(disposition === "queued" ? "Sent (queued after this turn)" : disposition === "steered" ? "Sent to the running agent" : "Sent");
    return true;
  } catch (error) {
    showNotice(`Not sent: ${errorMessage(error)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Permissions

/** "Allow Claude to run npm test -- ble-session?" */
function permissionQuestion(agent: AgentSnapshot, request: PermissionRequest): string {
  const kind = requestKind(request);
  if (kind === "question") return parseQuestionFormQuestions(request.input)?.[0]?.question ?? "The agent has a question.";
  if (kind === "plan") return "Approve this plan?";
  const who = providerName(agent.provider);
  const input = (request.input ?? {}) as Record<string, unknown>;
  const name = request.name || request.kind || "a tool";
  let action: string;
  if (typeof input.command === "string" && input.command.trim()) action = `run ${plainText(input.command)}`;
  else if (typeof input.file_path === "string" || typeof input.path === "string") {
    const file = String(input.file_path ?? input.path).split("/").pop();
    action = `${/edit|write|multiedit/i.test(name) ? "edit" : /read/i.test(name) ? "read" : "use"} ${file}`;
  } else if (request.title) action = plainText(request.title);
  else action = `use ${name}`;
  return `Allow ${who} to ${action}?`;
}

function providerName(provider: string | undefined): string {
  const id = (provider ?? "").split("/")[0]!;
  if (/claude/i.test(id)) return "Claude";
  if (/codex|openai/i.test(id)) return "Codex";
  if (/gemini/i.test(id)) return "Gemini";
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : "the agent";
}

/** Track the pending request's UI state: a fresh question form per request, cursors reset when it changes. */
function syncPendingRequest(agent: AgentSnapshot): void {
  const current = chat;
  if (!current) return;
  const request = agent.pendingPermissions?.[0] ?? null;
  const kind = request ? requestKind(request) : null;
  if (kind === "question" && request && current.flow?.requestId !== request.id) {
    const questions = parseQuestionFormQuestions(request.input);
    current.flow = questions ? startQuestionFlow(request.id, questions) : null;
    current.permissionIndex = 0;
    current.planSteps = false;
  } else if (kind !== "question" && current.flow) {
    current.flow = null;
  }
  if (!request) {
    current.permissionIndex = 0;
    current.planSteps = false;
  }
  if (kind === "permission" && current.permissionIndex >= PERMISSION_OPTIONS.length) current.permissionIndex = 0;
}

/** Ring on a plan: up from the first action opens the steps; down past the last step returns to the actions. */
function movePlanCursor(current: ChatState, stepCount: number, actionCount: number, down: boolean): void {
  if (current.planSteps) {
    if (down) {
      if (current.planIndex + 1 >= stepCount) current.planSteps = false;
      else current.planIndex++;
    } else current.planIndex = Math.max(0, current.planIndex - 1);
    return;
  }
  if (down) current.permissionIndex = Math.min(actionCount - 1, current.permissionIndex + 1);
  else if (current.permissionIndex > 0) current.permissionIndex--;
  else if (stepCount > 0) {
    current.planSteps = true;
    current.planIndex = stepCount - 1;
  }
}

function submitQuestions(agent: AgentSnapshot, request: PermissionRequest, flow: QuestionFlow): void {
  respond(agent, request, questionSubmitResponse(request, flow.questions, flow.selections, flow.otherTexts), "Answered");
}

function respond(agent: AgentSnapshot, request: PermissionRequest, response: PermissionResponse, done: string): void {
  const current = client;
  if (!current?.connected) {
    showNotice("Not connected to Paseo.");
    return;
  }
  try {
    current.respondToPermission(agent.id, request.id, response);
    showNotice(done);
  } catch (error) {
    showNotice(`Failed: ${errorMessage(error)}`);
  }
}

function answerPermission(agent: AgentSnapshot, request: PermissionRequest, option: number): void {
  const current = client;
  if (!current?.connected) {
    showNotice("Not connected to Paseo.");
    return;
  }
  try {
    if (option === 2) current.respondToPermission(agent.id, request.id, { behavior: "deny", message: "Denied from the glasses." });
    else if (option === 1 && Array.isArray(request.suggestions) && request.suggestions.length) {
      current.respondToPermission(agent.id, request.id, { behavior: "allow", updatedPermissions: request.suggestions });
    } else current.respondToPermission(agent.id, request.id, { behavior: "allow" });
    showNotice(option === 2 ? "Denied" : "Allowed");
  } catch (error) {
    showNotice(`Failed: ${errorMessage(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Dictation: glasses mic -> daemon speech-to-text -> message

async function startDictation(target: Dictation["target"]): Promise<void> {
  const current = client;
  const agentId = chat?.agentId;
  if (!current?.connected || !agentId || !window) {
    showNotice("Not connected to Paseo.");
    return;
  }
  if (!global.isAndroid) {
    if (chat) chat.textTarget = target;
    post({ type: "start-voice-input", windowId: window.windowId });
    return;
  }
  const id = `glasses-${Date.now().toString(36)}`;
  dictation = { id, state: "starting", seq: 0, startedMs: Date.now(), partial: "", preroll: [], micActive: false, target };
  post({ type: "raw-mic", windowId: window.windowId, on: true });
  updateTicker();
  render();
  try {
    await current.startDictation(id, DICTATION_FORMAT);
    if (dictation?.id !== id) { current.cancelDictation(id); return; }
    dictation.state = "listening";
    for (const chunk of dictation.preroll.splice(0)) sendDictationChunk(chunk);
  } catch (error) {
    if (dictation?.id !== id) return;
    cancelDictation();
    showNotice(`Can't dictate: ${errorMessage(error)}`);
  }
  render();
}

function handleRawMicState(active: boolean, reason?: string): void {
  if (!dictation) return;
  dictation.micActive = active;
  if (active) return;
  // No glasses mic: the shell's voice dialog still reaches the agent as text.
  const target = dictation.target;
  cancelDictation();
  if (chat) chat.textTarget = target;
  if (window) post({ type: "start-voice-input", windowId: window.windowId });
  if (reason) console.log(`paseo: mic tap unavailable: ${reason}`);
  render();
}

function handleRawPcm(pcm: string): void {
  const current = dictation;
  if (!current || !pcm) return;
  if (current.state === "listening") sendDictationChunk(pcm);
  else if (current.state === "starting" && current.preroll.length < DICTATION_PREROLL_MAX) current.preroll.push(pcm);
}

function sendDictationChunk(pcm: string): void {
  const current = dictation;
  if (!current || !client) return;
  try {
    client.sendDictationChunk(current.id, current.seq++, pcm, DICTATION_FORMAT);
  } catch (error) {
    cancelDictation();
    showNotice(`Dictation lost: ${errorMessage(error)}`);
  }
}

async function finishDictation(): Promise<void> {
  const current = dictation;
  const owner = client;
  const agentId = chat?.agentId;
  if (!current || !owner || !agentId) return;
  if (current.state === "finishing") return;
  if (window) post({ type: "raw-mic", windowId: window.windowId, on: false });
  if (current.state === "starting") {
    cancelDictation();
    render();
    return;
  }
  current.state = "finishing";
  render();
  try {
    const text = (await owner.finishDictation(current.id, current.seq - 1)).trim();
    if (dictation !== current) return;
    dictation = null;
    updateTicker();
    if (!text) {
      showNotice("Nothing heard.");
      return;
    }
    if (chat?.agentId !== agentId) return;
    draftTarget = current.target;
    draft.review(text);
  } catch (error) {
    if (dictation === current) dictation = null;
    updateTicker();
    showNotice(`Dictation failed: ${errorMessage(error)}`);
  }
  render();
}

function cancelDictation(): void {
  const current = dictation;
  if (!current) return;
  dictation = null;
  if (window) post({ type: "raw-mic", windowId: window.windowId, on: false });
  if (current.state !== "starting") client?.cancelDictation(current.id);
  updateTicker();
}

/** A dictated "Other…" answer for the question on screen. */
function deliverTextAnswer(text: string): void {
  const current = chat;
  const agent = chatAgent();
  const request = agent?.pendingPermissions?.[0] ?? null;
  if (!current?.flow || !agent || !request || current.flow.requestId !== request.id) {
    showNotice("That question is gone.");
    return;
  }
  const action = answerQuestionByText(current.flow, text);
  if (action.type === "submit") submitQuestions(agent, request, current.flow);
  else if (action.type === "stay") showNotice("Nothing heard.");
  render();
}

// ---------------------------------------------------------------------------
// App menu

function menuItems(): MenuItem[] {
  switch (screen.kind) {
    case "list":
      return listMenuItems();
    case "chat":
      return chatMenuItems();
    default:
      return [];
  }
}

function listMenuItems(): MenuItem[] {
  const items: MenuItem[] = [];
  const paired = loadPairing();
  items.push({
    label: paired ? "Pair again" : "Pair Paseo",
    onSelect: (ctx) => {
      ctx.stack.pop();
      beginPairing();
    },
  });
  if (client?.phase === "retrying") {
    items.push({
      label: "Reconnect now",
      onSelect: (ctx) => {
        ctx.stack.pop();
        client?.retryNow();
      },
    });
  }
  if (paired) {
    items.push({
      label: "Unpair",
      description: pairingLabel(paired),
      onSelect: (ctx) => {
        ctx.stack.pop();
        savePairing(null);
        syncClient();
      },
    });
  }
  items.push(submenuItem("Settings", (ctx) => ctx.stack.push(new WindowMenuLayer("Paseo settings", [toggleSettingMenuItem(paseoWakeOnAttentionSetting)]))));
  return items;
}

function chatMenuItems(): MenuItem[] {
  const current = chat;
  const agent = chatAgent();
  if (!current || !agent) return [];
  const items: MenuItem[] = [];
  if (agent.status === "running") {
    items.push({
      label: "Stop",
      onSelect: (ctx) => {
        ctx.stack.pop();
        void act(() => client!.cancelAgent(agent.id), "Stopping…");
      },
    });
  }
  const request = agent.pendingPermissions?.[0];
  if (request && current.flow && requestKind(request) === "question") {
    items.push({
      label: "Dismiss question",
      onSelect: (ctx) => {
        ctx.stack.pop();
        respond(agent, request, questionDismissResponse(request, current.flow!.questions, current.flow!.selections, current.flow!.otherTexts), "Dismissed");
      },
    });
  }
  items.push({
    label: "Archive",
    onSelect: (ctx) => {
      ctx.stack.pop();
      void act(() => client!.archiveAgent(agent.id), "Archived").then(() => {
        if (chat?.agentId === agent.id) setScreen({ kind: "list" });
      });
    },
  });
  if (current.scrollBack > 0) {
    items.push({
      label: "Jump to latest",
      onSelect: (ctx) => {
        ctx.stack.pop();
        current.scrollBack = 0;
      },
    });
  }
  items.push({
    label: "Reply with phone voice",
    description: "Use the phone's speech recognition instead of the glasses mic.",
    onSelect: (ctx) => {
      ctx.stack.pop();
      if (window) post({ type: "start-voice-input", windowId: window.windowId });
    },
  });
  return items;
}

async function act(run: () => Promise<unknown>, done: string): Promise<void> {
  if (!client?.connected) {
    showNotice("Not connected to Paseo.");
    return;
  }
  showNotice("Sending…");
  try {
    await run();
    showNotice(done);
  } catch (error) {
    showNotice(`Failed: ${errorMessage(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Pairing

function beginPairing(): void {
  paseoPairingLinkSetting.set("");
  setScreen({ kind: "pair" });
  post({ type: "start-text-setting-edit", settingId: paseoPairingLinkSetting.id });
}

async function pairFromDraft(): Promise<void> {
  if (screen.kind !== "pair") return;
  const parsed = parsePairingInput(paseoPairingLinkSetting.get());
  // ("in" rather than !parsed.ok: the app isn't strictNullChecks, so ok doesn't narrow.)
  if ("error" in parsed) {
    screenError = parsed.error;
    render();
    return;
  }
  const pairing: PaseoPairing = parsed.pairing;
  savePairing(pairing);
  syncClient();
  setScreen({ kind: "list" });
  showNotice(`Paired: ${pairingLabel(pairing)}`);
}

/** The draft link with the daemon's key hidden. */
function maskedDraft(): string {
  const pairingDraft = paseoPairingLinkSetting.get();
  if (!pairingDraft) return "";
  return pairingDraft.replace(/#offer=[^&\s]+/, "#offer=…");
}

// ---------------------------------------------------------------------------
// Views

function listView(): ListView {
  const paired = loadPairing();
  if (!paired) {
    return { rows: [], selected: -1, footerRight: "", message: "Not paired" };
  }
  const rows: ListRow[] = [];
  const sections = sectionAgents(agents.values());
  for (const section of sections) {
    rows.push({ kind: "section", label: section.label, count: section.agents.length });
    for (const agent of section.agents) rows.push({ kind: "agent", title: agentTitle(agent), key: agent.id });
  }
  let selected = rows.findIndex((row) => row.kind === "agent" && row.key === listSelectionKey);
  if (selected < 0) selected = rows.findIndex((row) => row.kind === "agent");
  const footerRight = notice?.text ?? (client?.connected && agentsLoaded ? sectionCounts(sections) : client?.status || "Connecting…");
  const message = rows.length ? undefined : client?.connected ? (agentsLoaded ? "No agents yet." : "Loading…") : client?.status || "Connecting…";
  return { rows, selected, footerRight, message };
}

function chatView(): ChatView {
  const current = chat;
  const agent = chatAgent();
  if (!current) return { lines: [], scrollBack: 0, footer: null, permission: null };
  const lines: ChatLine[] = current.entries.map((entry) => ({ role: entry.role, text: lineFor(entry) }));
  if (dictation) lines.push({ role: "user", text: dictation.partial || "…", live: true });
  else if (draft.active) lines.push({ role: "user", text: draft.text || "…", live: true });
  const request = agent?.pendingPermissions?.[0] ?? null;
  const permission =
    request && agent && !dictation && requestKind(request) === "permission"
      ? { question: permissionQuestion(agent, request), options: [...PERMISSION_OPTIONS], selected: current.permissionIndex }
      : null;
  return {
    lines,
    scrollBack: current.scrollBack,
    footer: chatFooter(agent),
    permission: draft.active ? { question: sendingDraft ? "Sending" : draft.editing ? "Edit on phone" : "Draft", options: DRAFT_OPTIONS, selected: draft.selected } : permission,
    message: current.error ? current.error : !current.loaded ? (client?.connected ? "Loading…" : client?.status || "Connecting…") : "No messages yet.",
  };
}

/** The question or plan screen when the pending request is one; null paints the chat. */
function choiceView(): { kind: "choice"; view: ChoiceView } | { kind: "steps"; steps: string[]; selected: number } | null {
  const current = chat;
  const agent = chatAgent();
  const request = agent?.pendingPermissions?.[0] ?? null;
  if (draft.active || !current || !agent || !request) return null;
  const kind = requestKind(request);
  const nowMs = Date.now();
  const listening = dictation && dictation.target === "other"
    ? { left: dictation.state === "finishing" ? "· Finishing" : "· Listening", right: formatClock(nowMs - dictation.startedMs) }
    : null;
  if (kind === "question" && current.flow) {
    const flow = current.flow;
    const question = currentQuestion(flow);
    const picked = flow.selections[flow.index] ?? new Set<number>();
    const rows = questionRows(question).map((row) => ({
      label: row.label,
      ...(row.kind === "option" && row.description ? { detail: row.description } : {}),
      ...(row.kind === "option" && question.multiSelect ? { check: picked.has(row.index) } : {}),
    }));
    const last = [...current.entries].reverse().find((entry) => entry.role === "assistant");
    return {
      kind: "choice",
      view: {
        heading: last && flow.index === 0 ? { text: lineFor(last), value: 187, maxLines: 1, gap: 9 } : null,
        question: question.question,
        rows,
        selected: flow.cursor,
        ...(dictation && dictation.target === "other" ? { live: dictation.partial } : {}),
        footer: notice ? { left: `· ${notice.text}`, right: "" } : listening ?? { left: "· Question", right: `${flow.index + 1}/${flow.questions.length}` },
      },
    };
  }
  if (kind === "plan") {
    const text = planText(request);
    const steps = planSteps(text);
    if (current.planSteps) return { kind: "steps", steps, selected: Math.min(current.planIndex, steps.length - 1) };
    const actions = planActions(request);
    return {
      kind: "choice",
      view: {
        heading: text ? { text: planLine(request.id, text), value: 255, maxLines: 3, gap: 60 } : null,
        question: "Approve this plan?",
        rows: actions.map((action) => ({ label: planActionLabel(action, actions) })),
        selected: Math.min(current.permissionIndex, actions.length - 1),
        footer: notice ? { left: `· ${notice.text}`, right: "" } : { left: "· Plan", right: `${steps.length} step${steps.length === 1 ? "" : "s"}` },
      },
    };
  }
  return null;
}

/** The plan's one-line summary: the daemon's glance summary when it has one, else the first sentence. */
function planLine(requestId: string, text: string): string {
  const id = `plan:${requestId}`;
  const cached = summaries.get(id);
  if (cached) return cached;
  if (chat && client?.supportsGlanceSummary && !summariesPending.has(id)) {
    void summarize(chat.agentId, [{ id, role: "assistant", text }]).then(() => scheduleRender());
  }
  return planSummary(text);
}

function chatFooter(agent: AgentSnapshot | null): { left: string; right: string } {
  const nowMs = Date.now();
  if (notice) return { left: `· ${notice.text}`, right: "" };
  if (dictation) return { left: dictation.state === "finishing" ? "· Finishing" : "· Listening", right: formatClock(nowMs - dictation.startedMs) };
  if (!client?.connected) return { left: `· ${client?.status || "Offline"}`, right: "" };
  if (!agent) return { left: "· Gone", right: "" };
  const bucket = agentBucket(agent);
  if (bucket === "working") {
    const started = agent.activeTurn?.startedAt ? Date.parse(agent.activeTurn.startedAt) : NaN;
    return { left: "· Working", right: Number.isFinite(started) ? formatDuration(nowMs - started) : "" };
  }
  if (bucket === "review") return { left: "· Done", right: "" };
  return { left: `· ${BUCKET_LABELS[bucket]}`, right: "" };
}

// ---------------------------------------------------------------------------
// Painting

function paint(win: AppWindow): Plane[] {
  return windowMenu(win).paint();
}

function paintContent(win: AppWindow): GrayImage {
  const image = new GrayImage(win.viewportWidth, win.viewportHeight, 0);
  const f = face();
  switch (screen.kind) {
    case "list": {
      const view = listView();
      listTop = listScrollTop(view.rows, view.selected, listTop);
      paintList(image, f, view, listTop);
      break;
    }
    case "chat": {
      const choice = choiceView();
      if (!choice) paintChat(image, f, chatView());
      else if (choice.kind === "steps") {
        paintPlanSteps(image, f, { steps: choice.steps, selected: choice.selected, footer: { left: "· Plan", right: `${choice.selected + 1}/${choice.steps.length}` } });
      } else paintChoice(image, f, choice.view);
      break;
    }
    case "pair":
      paintPair(image, f, {
        title: loadPairing() ? "Pair again" : "Pair Paseo",
        steps: ["Run \"paseo daemon pair\" on the computer", "Pairing link in the phone app"],
        draft: maskedDraft(),
        busy: busyText,
        error: screenError,
      });
      break;
  }
  return image.withDrawsBaked();
}

// ---------------------------------------------------------------------------
// Rendering

/** One-second repaints while a footer counts (working time, listening clock). */
function updateTicker(): void {
  const agent = chatAgent();
  const wanted = Boolean(window?.foreground && screenOn && screen.kind === "chat" && (dictation || agent?.status === "running"));
  if (wanted && !tickTimer) tickTimer = setInterval(() => render(), 1_000);
  else if (!wanted && tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

/** Data changed: repaint soon, coalescing bursts of stream updates. */
function scheduleRender(): void {
  const win = window;
  if (!win || win.renderTimer) return;
  win.renderTimer = setTimeout(() => {
    win.renderTimer = null;
    updateTicker();
    render();
  }, DATA_RENDER_COALESCE_MS);
}

function render(): void {
  if (window?.foreground && screenOn) renderNow();
}

function renderNow(inputFrameId = 0): void {
  const win = window;
  if (!win || !win.foreground || !screenOn) {
    if (inputFrameId) frameTimings.finishFrame(inputFrameId, "discarded: paseo window not visible");
    return;
  }
  const frameId = inputFrameId > 0 ? inputFrameId : frameTimings.startFrame(`render:${win.windowId}`);
  try {
    const paintStartedAtMs = Date.now();
    const planes = frameTimings.span(frameId, "paint", () => frameTimings.runWithFrame(frameId, () => paint(win)));
    const paintMs = Date.now() - paintStartedAtMs;
    const fingerprint = planesFingerprint(planes);
    if (fingerprint === win.lastSubmittedFingerprint) {
      frameTimings.finishFrame(frameId, "discarded: paseo content unchanged");
      return;
    }
    const communicator = getActiveDisplay();
    if (!communicator) {
      frameTimings.finishFrame(frameId, "discarded: no active display");
      return;
    }
    const { image, draws } = frameTimings.span(frameId, "flatten", () => flattenPlanesWithDraws(planes));
    const buffer = frameTimings.span(frameId, "to8bpp", () => image.to8bppBuffer());
    communicator.submitSurfaceFrame(
      buffer.buffer,
      win.surfaceId,
      0,
      0,
      image.width,
      image.height,
      fingerprint,
      paintMs,
      frameId,
      frameTimings.span(frameId, "prepareFrameDraws", () => prepareFrameDraws(draws)),
    );
    win.lastSubmittedFingerprint = fingerprint;
  } catch (error) {
    frameTimings.finishFrame(frameId, "discarded: paseo render failed");
    console.error(`paseo worker render failed: ${error}`);
  }
}

// ---------------------------------------------------------------------------
// Startup (last, so every module-level binding above is initialized)

// Spawned without a window (by the app's boot hook) for the home card.
if (hasPaseoBackgroundWork()) syncClient();
