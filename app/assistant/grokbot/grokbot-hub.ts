import { GrokBotApi, GrokBotError, uuidv4, type GrokEntriesPage, type GrokEntry, type GrokFetch } from "./grokbot-api";

export const DEFAULT_BOT_NAME = "Glasses";
export const FAST_POLL_MS = 1500;
export const SLOW_POLL_MS = 60_000;
/** Bots often ack ("te aviso") and finish later in a new turn; keep polling fast and buzzing this long after a turn the user started. */
export const FOLLOW_UP_MS = 5 * 60_000;
/** A session whose createdAtMs is this close to now was made by our get-or-create: the name matched no bot. */
export const NEW_BOT_WINDOW_MS = 10_000;
/** A turn never seen busy counts as finished after this many idle, empty pages (the official SDK's rule). */
export const IDLE_POLLS_TO_SETTLE = 4;
/** An interrupted turn can still read busy this long; it must not count as a new turn. */
const STOP_GRACE_MS = 3000;
const MAX_MESSAGES = 100;
const PENDING_SEQ = Number.MAX_SAFE_INTEGER;

export const KEY_REJECTED = "Cursor key rejected";
export const OFFLINE = "Can't reach Grok Bot";

export type BotMessage = { role: "user" | "bot"; text: string; createdAtMs: number; seq: number; pending?: boolean };

export class BotState {
  sessionId: string | null = null;
  messages: BotMessage[] = [];
  cursor = -1;
  loaded = false;
  working = false;
  workingSince = 0;
  unread = 0;
  /** Highest bot seq the user has seen; -1 until the first load sets it. */
  readSeq = -1;
  /** Our get-or-create made this session, so the name may be a typo. */
  created = false;
  /** The user stopped the last turn; cleared by their next message or a later bot message. */
  stopped = false;
  /** The running turn was started from the glasses, so its replies may buzz. */
  userTurn = false;
  followUpUntil = 0;
  seenBusy = false;
  idlePolls = 0;
  stoppedAtMs = 0;
  polledAtMs = 0;
  constructor(readonly name: string) {}
  get newEmpty(): boolean { return this.created && this.loaded && !this.messages.length; }
  get latestBot(): BotMessage | null {
    for (let i = this.messages.length - 1; i >= 0; i--) if (this.messages[i]!.role === "bot") return this.messages[i]!;
    return null;
  }
  get latest(): BotMessage | null { return this.messages[this.messages.length - 1] ?? null; }
}

export type GrokBotHubDeps = {
  fetch: GrokFetch;
  apiKey: () => string;
  botNames: () => readonly string[];
  loadCache: () => string;
  saveCache: (value: string) => void;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  uuid?: () => string;
  log?: (message: string) => void;
};

type CacheEntry = { id: string; readSeq: number; created?: boolean };

export function parseBotNames(value: string): string[] {
  const seen = new Set<string>();
  const names = value.split(",").map(name => name.trim()).filter(name => {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return names.length ? names : [DEFAULT_BOT_NAME];
}

export class GrokBotHub {
  /** KEY_REJECTED, OFFLINE or "". */
  error = "";
  private readonly api: GrokBotApi;
  private readonly bots = new Map<string, BotState>();
  private order: string[] = [];
  private key = "";
  private accountKey = "";
  private namesKey = "";
  private timer: unknown = null;
  private started = false;
  private polling = false;
  private pollAgain = false;
  private authFailed = false;
  private backoffMs = 0;
  private watching: readonly string[] = [];
  private viewing: string | null = null;
  private signature = "";
  private readonly listeners = new Set<() => void>();
  private readonly replyListeners = new Set<(name: string) => void>();
  private readonly loggedKinds = new Set<string>();

  constructor(private readonly deps: GrokBotHubDeps) {
    this.api = new GrokBotApi(deps.fetch, () => deps.apiKey());
  }

  get configured(): boolean { return Boolean(this.deps.apiKey().trim()); }
  get defaultBot(): string { this.sync(); return this.order[0]!; }
  list(): BotState[] { this.sync(); return this.order.map(name => this.bots.get(name)!); }
  bot(name: string): BotState | null { this.sync(); return this.bots.get(name) ?? null; }

  onChanged(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  /** A bot replied to a turn the user started, and that chat is not on screen. */
  onReply(listener: (name: string) => void): () => void { this.replyListeners.add(listener); return () => { this.replyListeners.delete(listener); }; }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.refresh();
  }

  stop(): void {
    this.started = false;
    this.clearTimer();
  }

  configChanged(): void {
    if (!this.sync()) return;
    this.emit(true);
    void this.refresh();
  }

  /** Bots the user is looking at (the list: all of them; a chat: that one); polled fast. */
  setWatching(names: readonly string[]): void {
    const was = this.watching.join("\n");
    this.watching = [...names];
    if (was === this.watching.join("\n")) return;
    if (this.watching.length) void this.refresh();
    else this.schedule();
  }

  setViewing(name: string | null): void {
    this.viewing = name;
    if (name) this.markRead(name);
  }

  markRead(name: string): void {
    const bot = this.bot(name);
    if (!bot) return;
    const seq = bot.latestBot?.seq ?? -1;
    if (bot.unread === 0 && seq <= bot.readSeq) return;
    bot.unread = 0;
    bot.readSeq = Math.max(bot.readSeq, seq);
    this.persist();
    this.emit();
  }

  /** "" once the bot accepted the message, else why not (the caller keeps the text). */
  async send(name: string, text: string): Promise<string> {
    const bot = this.bot(name);
    if (!bot) return "Unknown bot";
    if (!this.configured) return "No Cursor key";
    const pending: BotMessage = { role: "user", text, createdAtMs: this.now(), seq: PENDING_SEQ, pending: true };
    bot.messages.push(pending);
    bot.stopped = false;
    this.emit(true);
    try {
      const id = await this.ensureSession(bot);
      await this.api.send(id, text, (this.deps.uuid ?? uuidv4)());
    } catch (error) {
      bot.messages = bot.messages.filter(message => message !== pending);
      const reason = this.noteError(error, false);
      this.emit(true);
      this.schedule();
      return reason;
    }
    if (!bot.working) this.beginTurn(bot, this.now(), false);
    bot.userTurn = true;
    this.emit(true);
    this.schedule();
    return "";
  }

  async interrupt(name: string): Promise<boolean> {
    const bot = this.bot(name);
    if (!bot?.sessionId || !bot.working) return false;
    try {
      await this.api.interrupt(bot.sessionId, "Stopped from the glasses");
    } catch (error) {
      this.noteError(error, false);
      this.emit(true);
      return false;
    }
    this.settle(bot);
    bot.followUpUntil = 0;
    bot.stopped = true;
    bot.stoppedAtMs = this.now();
    this.emit(true);
    this.schedule();
    return true;
  }

  async refresh(): Promise<void> {
    this.clearTimer();
    if (this.polling) { this.pollAgain = true; return; }
    if (!this.started || !this.configured || this.authFailed) return;
    this.polling = true;
    try {
      const now = this.now();
      const due = this.list().filter(bot => !bot.loaded || bot.working || now < bot.followUpUntil
        || this.watching.includes(bot.name) || now - bot.polledAtMs >= SLOW_POLL_MS - FAST_POLL_MS);
      for (const bot of due) await this.poll(bot);
      this.error = "";
      this.backoffMs = 0;
    } catch (error) {
      this.noteError(error, true);
    } finally {
      this.polling = false;
      this.emit();
      const again = this.pollAgain;
      this.pollAgain = false;
      if (again) void this.refresh();
      else this.schedule();
    }
  }

  private now(): number { return (this.deps.now ?? Date.now)(); }

  private sync(): boolean {
    const key = this.deps.apiKey().trim();
    const names = parseBotNames(this.deps.botNames().join(","));
    const namesKey = names.join("\n");
    if (key === this.key && namesKey === this.namesKey) return false;
    if (key !== this.key) { this.authFailed = false; this.backoffMs = 0; this.error = ""; }
    // Session ids belong to the account behind the key.
    const accountChanged = Boolean(key && this.accountKey) && key !== this.accountKey;
    if (accountChanged) { this.bots.clear(); this.deps.saveCache("{}"); }
    this.key = key;
    if (key) this.accountKey = key;
    this.namesKey = namesKey;
    this.order = names;
    const cache = accountChanged ? {} : this.readCache();
    for (const name of names) {
      if (this.bots.has(name)) continue;
      const bot = new BotState(name);
      const cached = cache[name];
      if (cached) { bot.sessionId = cached.id; bot.readSeq = cached.readSeq; bot.created = Boolean(cached.created); }
      this.bots.set(name, bot);
    }
    for (const name of [...this.bots.keys()]) if (!names.includes(name)) this.bots.delete(name);
    return true;
  }

  private readCache(): Record<string, CacheEntry> {
    try {
      const parsed = JSON.parse(this.deps.loadCache() || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch { return {}; }
  }

  private persist(): void {
    const cache: Record<string, CacheEntry> = {};
    for (const bot of this.bots.values()) {
      if (bot.sessionId) cache[bot.name] = { id: bot.sessionId, readSeq: bot.readSeq, ...(bot.created ? { created: true } : {}) };
    }
    this.deps.saveCache(JSON.stringify(cache));
  }

  private async ensureSession(bot: BotState): Promise<string> {
    if (bot.sessionId) return bot.sessionId;
    const session = await this.api.session(bot.name);
    bot.sessionId = session.id;
    bot.created = Math.abs(this.now() - Number(session.createdAtMs)) <= NEW_BOT_WINDOW_MS;
    this.persist();
    return session.id;
  }

  private async poll(bot: BotState): Promise<void> {
    const id = await this.ensureSession(bot);
    let page: GrokEntriesPage;
    try {
      page = await this.api.entries(id, bot.cursor);
    } catch (error) {
      if (!(error instanceof GrokBotError && error.status === 404)) throw error;
      // The bot was deleted: the next poll gets (or makes) a session by name again.
      Object.assign(bot, { sessionId: null, cursor: -1, messages: [], loaded: false, created: false });
      this.persist();
      return;
    }
    bot.polledAtMs = this.now();
    const replyForUser = bot.userTurn || this.now() < bot.followUpUntil;
    const arrived = this.apply(bot, page.entries, !bot.loaded);
    bot.cursor = Math.max(bot.cursor, page.latestUpdatedSeq);
    bot.loaded = true;
    this.applyTurn(bot, page, arrived > 0);
    if (arrived && replyForUser && this.viewing !== bot.name) {
      for (const listener of Array.from(this.replyListeners)) listener(bot.name);
    }
  }

  /** Merges entries into the transcript; returns how many new bot messages arrived after the first load. */
  private apply(bot: BotState, entries: readonly GrokEntry[], initial: boolean): number {
    let arrived = 0;
    for (const entry of entries) {
      const message = this.toMessage(entry);
      if (!message) continue;
      const index = bot.messages.findIndex(existing => !existing.pending && existing.seq === message.seq);
      if (index >= 0) { bot.messages[index] = message; continue; }
      if (message.role === "user") {
        const echoed = bot.messages.findIndex(existing => existing.pending && existing.text.trim() === message.text.trim());
        if (echoed >= 0) bot.messages.splice(echoed, 1);
      } else if (!initial) {
        arrived++;
        if (bot.stopped && this.now() - bot.stoppedAtMs > STOP_GRACE_MS) bot.stopped = false;
      }
      const at = bot.messages.findIndex(existing => existing.seq > message.seq);
      bot.messages.splice(at < 0 ? bot.messages.length : at, 0, message);
    }
    const confirmed = bot.messages.filter(message => !message.pending);
    if (confirmed.length > MAX_MESSAGES) {
      const drop = new Set(confirmed.slice(0, confirmed.length - MAX_MESSAGES));
      bot.messages = bot.messages.filter(message => !drop.has(message));
    }
    if (initial && bot.readSeq < 0) { bot.readSeq = bot.latestBot?.seq ?? 0; this.persist(); }
    if (this.viewing === bot.name) this.markRead(bot.name);
    else bot.unread = bot.messages.filter(message => message.role === "bot" && message.seq > bot.readSeq).length;
    return arrived;
  }

  private toMessage(entry: GrokEntry): BotMessage | null {
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    const base = { text, createdAtMs: Number(entry.createdAtMs) || 0, seq: Number(entry.seq) };
    if (entry.kind === "message") return entry.role === "user" && text ? { role: "user", ...base } : null;
    if (entry.kind === "send-message") return text ? { role: "bot", ...base } : null;
    if (!this.loggedKinds.has(entry.kind)) {
      this.loggedKinds.add(entry.kind);
      this.deps.log?.(`grokbot: ignoring entry kind "${entry.kind}"`);
    }
    return null;
  }

  private applyTurn(bot: BotState, page: GrokEntriesPage, replied: boolean): void {
    const now = this.now();
    const busy = page.turn.inFlight || page.turn.queued > 0 || !page.turn.idle;
    if (busy) {
      if (now - bot.stoppedAtMs < STOP_GRACE_MS) return;
      if (!bot.working) this.beginTurn(bot, now, true);
      bot.seenBusy = true;
      bot.idlePolls = 0;
      return;
    }
    if (!bot.working) return;
    // A reply shows the turn ran even if every poll caught it idle.
    if (replied) bot.seenBusy = true;
    if (page.entries.length) { bot.idlePolls = 0; return; }
    bot.idlePolls++;
    if (bot.seenBusy || bot.idlePolls >= IDLE_POLLS_TO_SETTLE) this.settle(bot);
  }

  private beginTurn(bot: BotState, now: number, seenBusy: boolean): void {
    bot.working = true;
    bot.workingSince = now;
    bot.userTurn = now < bot.followUpUntil;
    bot.seenBusy = seenBusy;
    bot.idlePolls = 0;
  }

  private settle(bot: BotState): void {
    if (bot.userTurn) bot.followUpUntil = this.now() + FOLLOW_UP_MS;
    bot.working = false;
    bot.userTurn = false;
    bot.seenBusy = false;
    bot.idlePolls = 0;
  }

  private noteError(error: unknown, polling: boolean): string {
    if (error instanceof GrokBotError && error.rejectedKey) {
      this.error = KEY_REJECTED;
      this.authFailed = true;
      return KEY_REJECTED;
    }
    if (error instanceof GrokBotError && error.status === -1) return error.message;
    this.error = OFFLINE;
    if (polling) this.backoffMs = Math.min(SLOW_POLL_MS, Math.max(3000, this.backoffMs * 2));
    return OFFLINE;
  }

  private schedule(): void {
    this.clearTimer();
    if (!this.started || !this.configured || this.authFailed) return;
    const now = this.now();
    const fast = this.watching.length > 0 || this.list().some(bot => bot.working || now < bot.followUpUntil);
    const wait = Math.max(fast ? FAST_POLL_MS : SLOW_POLL_MS, this.backoffMs);
    this.timer = (this.deps.setTimeout ?? setTimeout)(() => { this.timer = null; void this.refresh(); }, wait);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    (this.deps.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>)))(this.timer);
    this.timer = null;
  }

  private emit(force = false): void {
    const signature = this.error + "|" + this.list().map(bot => [bot.name, bot.sessionId, bot.cursor, bot.messages.length,
      bot.latest?.text.length ?? 0, bot.working, bot.unread, bot.newEmpty, bot.stopped, bot.loaded].join(",")).join(";");
    if (!force && signature === this.signature) return;
    this.signature = signature;
    for (const listener of Array.from(this.listeners)) listener();
  }
}
