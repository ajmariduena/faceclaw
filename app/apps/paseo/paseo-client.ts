/**
 * A minimal client for the Paseo daemon's WebSocket session protocol: the
 * hello handshake, request/response correlation by requestId, the handful of
 * session messages the glasses need, and a retry loop with jittered
 * exponential backoff (relay drops are routine). Over the relay the socket
 * is wrapped in the vendored E2EE channel keyed by the daemon's public key.
 *
 * Why not @getpaseo/client: bundled it is 4.9 MB minified (its protocol
 * package carries every zod schema and DaemonClient validates each inbound
 * message with them), too much for a NativeScript worker. This speaks the
 * same wire format for exactly the messages below.
 *
 * Transport and the vendored adapters are injected, so this runs unchanged
 * under Node (tools/paseo-probe) and in the app worker.
 */
import type { DaemonTransport, WebSocketFactory } from "./vendor/paseo-transport";
import { relaySocketUrl, type PaseoPairing } from "./paseo-pairing";

// Provided by the NativeScript runtime and Node; absent from the test tsconfig's ES2020 lib.
declare const TextDecoder: new () => { decode(input: Uint8Array): string };

export type ClientPhase = "idle" | "connecting" | "connected" | "retrying";

export type TransportAdapters = {
  createWebSocketTransportFactory: (factory: WebSocketFactory) => (options: { url: string }) => DaemonTransport;
  createEncryptedTransport: (base: DaemonTransport, daemonPublicKeyB64: string, logger: { warn(obj: object, msg?: string): void }) => DaemonTransport;
};

export type PaseoClientDeps = {
  webSocketFactory: WebSocketFactory;
  adapters: TransportAdapters;
  clientId: string;
  appVersion: string;
  log?: (message: string) => void;
  /** Request ids; defaults to a time+random id. */
  randomId?: () => string;
};

export type ServerInfo = {
  serverId: string;
  hostname: string | null;
  version: string | null;
  features: Record<string, unknown>;
  capabilities: Record<string, unknown>;
};

export type SessionMessage = { type: string; payload?: any; [key: string]: any };
type Handler = (message: SessionMessage) => void;

export type GlanceItem = { id: string; role: "user" | "assistant"; text: string };
export type GlanceLine = { id: string; line: string };

const RECONNECT_MIN_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 60_000;
/** How long the socket may stay open without the server_info that follows hello. */
const READY_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 20_000;
/** App-level liveness: the relay can keep a dead session's socket open. */
const PING_INTERVAL_MS = 25_000;
const PING_TIMEOUT_MS = 10_000;
const DICTATION_FINAL_TIMEOUT_MS = 20_000;

/** Capabilities advertised in hello; see Paseo's session.ts for what each gates. */
const CLIENT_CAPABILITIES = {
  // Rejections arrive as hello.rejected instead of a bare close.
  hello_rejection: true,
  // agent_stream only for agents with a timeline subscription; attention
  // comes as the dedicated agent_attention_required message instead.
  selective_agent_timeline: true,
};

export class PaseoRequestError extends Error {
  constructor(
    message: string,
    readonly kind: "disconnected" | "timeout" | "rejected",
  ) {
    super(message);
  }
}

export class PaseoDaemonClient {
  private phaseValue: ClientPhase = "idle";
  private statusValue = "";
  private serverInfoValue: ServerInfo | null = null;
  private transport: DaemonTransport | null = null;
  private transportCleanup: Array<() => void> = [];
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private pingDeadline: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = RECONNECT_MIN_DELAY_MS;
  /** Bumped on every connect attempt and stop, so stale async work can tell it lost. */
  private generation = 0;
  private running = false;
  private readonly listeners = new Set<() => void>();
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly waiters = new Set<{ match: (message: SessionMessage) => boolean; resolve: (message: SessionMessage) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> | null }>();

  constructor(
    public pairing: PaseoPairing,
    private readonly deps: PaseoClientDeps,
  ) {}

  get phase(): ClientPhase {
    return this.phaseValue;
  }

  /** Human-readable connection status ("" when connected). */
  get status(): string {
    return this.statusValue;
  }

  get serverInfo(): ServerInfo | null {
    return this.serverInfoValue;
  }

  get connected(): boolean {
    return this.phaseValue === "connected";
  }

  /** The daemon condenses messages for the glasses (glance.summarize). */
  get supportsGlanceSummary(): boolean {
    const state = this.serverInfoValue?.capabilities.glanceSummary as { enabled?: boolean } | undefined;
    return state?.enabled === true;
  }

  /** Phase or status changed. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Session messages of one type (agent_update, agent_stream, ...). */
  on(type: string, handler: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.reconnectDelayMs = RECONNECT_MIN_DELAY_MS;
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.generation++;
    this.clearTimers();
    this.teardownTransport(1000, "closing");
    this.failWaiters(new PaseoRequestError("Disconnected.", "disconnected"));
    this.setPhase("idle", "");
  }

  retryNow(): void {
    this.stop();
    this.start();
  }

  updatePairing(pairing: PaseoPairing): void {
    if (JSON.stringify(pairing) === JSON.stringify(this.pairing)) return;
    this.pairing = pairing;
    if (this.running) this.retryNow();
  }

  // -------------------------------------------------------------------------
  // Messages

  /** Fire-and-forget session message. */
  send(message: SessionMessage): void {
    const transport = this.transport;
    if (!transport || this.phaseValue !== "connected") throw new PaseoRequestError("Not connected to Paseo.", "disconnected");
    transport.send(JSON.stringify({ type: "session", message }));
  }

  /**
   * Send a request and resolve with the payload of the response whose
   * requestId matches (responses whose payload carries `error` reject).
   */
  async request<T = any>(message: SessionMessage, responseType: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    const requestId = message.requestId ?? this.randomId();
    const waiting = this.waitFor(
      (candidate) => candidate.type === responseType && candidate.payload?.requestId === requestId,
      timeoutMs,
    );
    try {
      this.send({ ...message, requestId });
    } catch (error) {
      waiting.cancel();
      throw error;
    }
    const response = await waiting.promise;
    const payload = response.payload ?? {};
    if (typeof payload.error === "string" && payload.error) throw new PaseoRequestError(payload.error, "rejected");
    return payload as T;
  }

  /** The current agents; with `subscribe`, later agent_update messages keep them live. */
  fetchAgents(options: { subscribe?: boolean; limit?: number } = {}): Promise<{ entries: Array<{ agent: any }>; pageInfo?: { hasMore?: boolean } }> {
    return this.request(
      {
        type: "fetch_agents_request",
        scope: "active",
        filter: { includeArchived: false },
        sort: [{ key: "updated_at", direction: "desc" }],
        page: { limit: options.limit ?? 200 },
        ...(options.subscribe ? { subscribe: {} } : {}),
      },
      "fetch_agents_response",
    );
  }

  fetchAgentTimeline(agentId: string, limit: number): Promise<{ agentId: string; agent: any; entries: Array<{ item: any; cursor?: any }>; hasMore?: boolean }> {
    return this.request(
      { type: "fetch_agent_timeline_request", agentId, direction: "tail", limit, projection: "projected" },
      "fetch_agent_timeline_response",
    );
  }

  /** Replace the set of agents whose timeline streams (agent_stream) this session receives. */
  setTimelineSubscription(agentIds: string[]): Promise<{ agentIds: string[] }> {
    return this.request({ type: "agent.timeline.set_subscription.request", agentIds }, "agent.timeline.set_subscription.response");
  }

  async sendAgentMessage(agentId: string, text: string): Promise<"started" | "steered" | "queued" | null> {
    const payload = await this.request<{ accepted: boolean; error: string | null; disposition?: "started" | "steered" | "queued" }>(
      { type: "send_agent_message_request", agentId, text, messageId: this.randomId(), activeTurnBehavior: "auto" },
      "send_agent_message_response",
    );
    if (!payload.accepted) throw new PaseoRequestError(payload.error ?? "The agent did not accept the message.", "rejected");
    return payload.disposition ?? null;
  }

  respondToPermission(agentId: string, requestId: string, response: { behavior: "allow"; updatedPermissions?: unknown[] } | { behavior: "deny"; message?: string }): void {
    this.send({ type: "agent_permission_response", agentId, requestId, response });
  }

  cancelAgent(agentId: string): Promise<unknown> {
    return this.request({ type: "cancel_agent_request", agentId }, "cancel_agent_response");
  }

  archiveAgent(agentId: string): Promise<{ archivedAt: string }> {
    return this.request({ type: "archive_agent_request", agentId }, "agent_archived");
  }

  /** The daemon's own pairing link (local probes only; it carries the daemon key). */
  getPairingOffer(): Promise<{ url: string; relayEnabled: boolean }> {
    return this.request({ type: "daemon.get_pairing_offer.request" }, "daemon.get_pairing_offer.response");
  }

  // -------------------------------------------------------------------------
  // Dictation (raw PCM streamed to the daemon's speech-to-text)

  async startDictation(dictationId: string, format: string): Promise<void> {
    const waiting = this.waitFor(
      (message) =>
        (message.type === "dictation_stream_ack" && message.payload?.dictationId === dictationId && message.payload?.ackSeq === -1) ||
        (message.type === "dictation_stream_error" && message.payload?.dictationId === dictationId),
      REQUEST_TIMEOUT_MS,
    );
    try {
      this.send({ type: "dictation_stream_start", dictationId, format });
    } catch (error) {
      waiting.cancel();
      throw error;
    }
    const message = await waiting.promise;
    if (message.type === "dictation_stream_error") throw new PaseoRequestError(String(message.payload?.error ?? "Dictation failed."), "rejected");
  }

  sendDictationChunk(dictationId: string, seq: number, audioBase64: string, format: string): void {
    this.send({ type: "dictation_stream_chunk", dictationId, seq, audio: audioBase64, format });
  }

  async finishDictation(dictationId: string, finalSeq: number): Promise<string> {
    const waiting = this.waitFor(
      (message) =>
        (message.type === "dictation_stream_final" || message.type === "dictation_stream_error") && message.payload?.dictationId === dictationId,
      DICTATION_FINAL_TIMEOUT_MS,
    );
    try {
      this.send({ type: "dictation_stream_finish", dictationId, finalSeq });
    } catch (error) {
      waiting.cancel();
      throw error;
    }
    const message = await waiting.promise;
    if (message.type === "dictation_stream_error") throw new PaseoRequestError(String(message.payload?.error ?? "Dictation failed."), "rejected");
    return String(message.payload?.text ?? "");
  }

  cancelDictation(dictationId: string): void {
    try {
      this.send({ type: "dictation_stream_cancel", dictationId });
    } catch {
      // Nothing to cancel on a dead connection.
    }
  }

  // -------------------------------------------------------------------------
  // Glance summaries

  /** One line per item from the daemon (requires supportsGlanceSummary). */
  async summarizeForGlance(items: GlanceItem[], agentId?: string): Promise<GlanceLine[]> {
    const payload = await this.request<{ lines: GlanceLine[]; error: string | null }>(
      { type: "glance.summarize.request", ...(agentId ? { agentId } : {}), items: items.slice(0, 20) },
      "glance.summarize.response",
      60_000,
    );
    return Array.isArray(payload.lines) ? payload.lines : [];
  }

  // -------------------------------------------------------------------------
  // Connection lifecycle

  private connect(): void {
    const generation = ++this.generation;
    this.clearTimers();
    this.teardownTransport(1001, "reconnecting");
    this.setPhase("connecting", "Connecting…");
    let transport: DaemonTransport;
    try {
      transport = this.createTransport();
    } catch (error) {
      this.scheduleReconnect(errorMessage(error));
      return;
    }
    this.transport = transport;
    const lost = (reason: string) => {
      if (generation !== this.generation) return;
      this.generation++;
      this.teardownTransport(1001, "lost");
      this.failWaiters(new PaseoRequestError(reason, "disconnected"));
      this.scheduleReconnect(reason);
    };
    this.transportCleanup = [
      transport.onOpen(() => {
        if (generation !== this.generation) return;
        try {
          transport.send(
            JSON.stringify({
              type: "hello",
              clientId: this.deps.clientId,
              clientType: "mobile",
              protocolVersion: 1,
              capabilities: CLIENT_CAPABILITIES,
              appVersion: this.deps.appVersion,
            }),
          );
        } catch (error) {
          lost(errorMessage(error));
        }
      }),
      transport.onMessage((data) => {
        if (generation !== this.generation) return;
        this.handleFrame(data);
      }),
      transport.onClose((event) => lost(describeClose(event))),
      transport.onError((event) => lost(describeError(event))),
    ];
    this.readyTimer = setTimeout(() => {
      if (generation === this.generation && this.phaseValue !== "connected") lost("The daemon did not answer the handshake.");
    }, READY_TIMEOUT_MS);
  }

  private createTransport(): DaemonTransport {
    const baseFactory = this.deps.adapters.createWebSocketTransportFactory(this.deps.webSocketFactory);
    if (this.pairing.kind === "direct") return baseFactory({ url: this.pairing.url });
    const base = baseFactory({ url: relaySocketUrl(this.pairing) });
    return this.deps.adapters.createEncryptedTransport(base, this.pairing.daemonPublicKeyB64, {
      warn: (obj, msg) => this.deps.log?.(`paseo: ${msg ?? ""} ${safeJson(obj)}`),
    });
  }

  private handleFrame(data: unknown): void {
    const text = typeof data === "string" ? data : decodeUtf8(data);
    if (!text) return;
    let frame: any;
    try {
      frame = JSON.parse(text);
    } catch {
      return;
    }
    if (!frame || typeof frame !== "object") return;
    if (frame.type === "pong") {
      this.notePong();
      return;
    }
    if (frame.type === "hello.rejected") {
      const reason = String(frame.reason ?? "rejected");
      this.deps.log?.(`paseo: hello rejected: ${reason}`);
      this.statusValue =
        reason === "password_required" || reason === "incorrect_password"
          ? "The daemon wants a password; pair with a relay link."
          : reason === "incompatible_protocol"
            ? "This daemon speaks a newer protocol."
            : `Rejected: ${reason}`;
      this.emit();
      return;
    }
    if (frame.type !== "session" || !frame.message || typeof frame.message !== "object") return;
    const message = frame.message as SessionMessage;
    if (message.type === "status" && message.payload?.status === "server_info") {
      this.serverInfoValue = {
        serverId: String(message.payload.serverId ?? ""),
        hostname: typeof message.payload.hostname === "string" ? message.payload.hostname : null,
        version: typeof message.payload.version === "string" ? message.payload.version : null,
        features: message.payload.features ?? {},
        capabilities: message.payload.capabilities ?? {},
      };
      if (this.phaseValue === "connecting") {
        if (this.readyTimer) clearTimeout(this.readyTimer);
        this.readyTimer = null;
        this.reconnectDelayMs = RECONNECT_MIN_DELAY_MS;
        this.setPhase("connected", "");
        this.deps.log?.(`paseo: connected to ${this.serverInfoValue.hostname ?? this.serverInfoValue.serverId} (${this.serverInfoValue.version ?? "?"})`);
        this.schedulePing();
      }
      return;
    }
    for (const waiter of [...this.waiters]) {
      if (!waiter.match(message)) continue;
      this.waiters.delete(waiter);
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
    const handlers = this.handlers.get(message.type);
    if (handlers) for (const handler of [...handlers]) handler(message);
  }

  private waitFor(match: (message: SessionMessage) => boolean, timeoutMs: number): { promise: Promise<SessionMessage>; cancel: () => void } {
    let cancel = () => {};
    const promise = new Promise<SessionMessage>((resolve, reject) => {
      const waiter = { match, resolve, reject, timer: null as ReturnType<typeof setTimeout> | null };
      waiter.timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new PaseoRequestError("Paseo did not answer in time.", "timeout"));
      }, timeoutMs);
      this.waiters.add(waiter);
      cancel = () => {
        this.waiters.delete(waiter);
        if (waiter.timer) clearTimeout(waiter.timer);
        reject(new PaseoRequestError("Cancelled.", "disconnected"));
      };
    });
    promise.catch(() => {});
    return { promise, cancel };
  }

  private failWaiters(error: Error): void {
    for (const waiter of [...this.waiters]) {
      this.waiters.delete(waiter);
      if (waiter.timer) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  private schedulePing(): void {
    if (this.pingTimer) clearTimeout(this.pingTimer);
    const generation = this.generation;
    this.pingTimer = setTimeout(() => {
      this.pingTimer = null;
      if (generation !== this.generation || !this.transport) return;
      try {
        this.transport.send(JSON.stringify({ type: "ping", requestId: this.randomId(), clientSentAt: Date.now() }));
      } catch (error) {
        this.deps.log?.(`paseo: ping failed: ${errorMessage(error)}`);
      }
      this.pingDeadline = setTimeout(() => {
        this.pingDeadline = null;
        if (generation !== this.generation) return;
        this.generation++;
        this.teardownTransport(1001, "liveness timeout");
        this.failWaiters(new PaseoRequestError("The connection went quiet.", "disconnected"));
        this.scheduleReconnect("The connection went quiet.");
      }, PING_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  private notePong(): void {
    if (this.pingDeadline) clearTimeout(this.pingDeadline);
    this.pingDeadline = null;
    this.schedulePing();
  }

  private scheduleReconnect(reason: string): void {
    if (!this.running) return;
    const delay = Math.round(this.reconnectDelayMs * (0.75 + Math.random() * 0.5));
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS);
    this.setPhase("retrying", reason);
    this.deps.log?.(`paseo: ${reason} (retrying in ${delay} ms)`);
    const generation = this.generation;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (generation === this.generation && this.running) this.connect();
    }, delay);
  }

  private teardownTransport(code: number, reason: string): void {
    const transport = this.transport;
    this.transport = null;
    for (const cleanup of this.transportCleanup) cleanup();
    this.transportCleanup = [];
    try {
      transport?.close(code, reason);
    } catch {
      // Already gone.
    }
  }

  private clearTimers(): void {
    for (const timer of [this.readyTimer, this.reconnectTimer, this.pingTimer, this.pingDeadline]) if (timer) clearTimeout(timer);
    this.readyTimer = this.reconnectTimer = this.pingTimer = this.pingDeadline = null;
  }

  private setPhase(phase: ClientPhase, status: string): void {
    if (this.phaseValue === phase && this.statusValue === status) return;
    this.phaseValue = phase;
    this.statusValue = status;
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private randomId(): string {
    return this.deps.randomId ? this.deps.randomId() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function errorMessage(error: unknown): string {
  return String((error as Error)?.message ?? error);
}

function describeClose(event: unknown): string {
  const record = event as { code?: number; reason?: string } | undefined;
  if (record && typeof record.reason === "string" && record.reason.trim()) return `Connection closed: ${record.reason.trim()}`;
  if (record && typeof record.code === "number") return `Connection closed (${record.code}).`;
  return "Connection closed.";
}

function describeError(event: unknown): string {
  if (event instanceof Error) return event.message;
  const record = event as { message?: string } | undefined;
  if (record && typeof record.message === "string" && record.message.trim()) return record.message.trim();
  return "Connection failed.";
}

function decodeUtf8(data: unknown): string {
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return "";
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
