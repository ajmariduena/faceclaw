// Undocumented v0 routes that Cursor's own @cursor/bdk SDK calls; they may change without notice (research/grok-bot/api.md).

export const GROKBOT_BASE = "https://api.cursor.com";

export type GrokFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) =>
  Promise<{ status: number; text(): Promise<string> }>;

export type GrokSession = { id: string; name: string; createdAtMs: number; latestUpdatedSeq: number };
export type GrokEntry = { seq: number; updatedSeq: number; kind: string; role?: string; text?: string; createdAtMs: number };
export type GrokTurn = { idle: boolean; inFlight: boolean; queued: number };
export type GrokEntriesPage = { entries: GrokEntry[]; latestUpdatedSeq: number; turn: GrokTurn };

/** status 0 is a network failure; -1 a reply the API accepted but did not deliver. */
export class GrokBotError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
  get rejectedKey(): boolean { return this.status === 401 || this.status === 403; }
}

const DELIVERED = new Set(["accepted_temporal", "duplicate"]);

export function uuidv4(random: () => number = Math.random): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const value = Math.floor(random() * 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export class GrokBotApi {
  constructor(private readonly fetch: GrokFetch, private readonly key: () => string, private readonly base = GROKBOT_BASE) {}

  /** Get-or-create by name: a misspelled name makes a new, empty bot. */
  session(name: string): Promise<GrokSession> { return this.call("POST", "/v0/grokbot/sessions", { name }); }

  async send(sessionId: string, text: string, messageId: string): Promise<void> {
    const reply = await this.call<{ delivery?: string }>("POST", `/v0/grokbot/sessions/${encodeURIComponent(sessionId)}/messages`, { text, messageId });
    if (!DELIVERED.has(reply.delivery ?? "")) throw new GrokBotError(-1, `Not delivered (${reply.delivery ?? "no delivery"})`);
  }

  async entries(sessionId: string, afterUpdatedSeq: number): Promise<GrokEntriesPage> {
    const page = await this.call<Partial<Omit<GrokEntriesPage, "turn">> & { turn?: Partial<GrokTurn> }>("GET",
      `/v0/grokbot/sessions/${encodeURIComponent(sessionId)}/entries?afterUpdatedSeq=${afterUpdatedSeq}`);
    const turn = page.turn ?? {};
    return { entries: Array.isArray(page.entries) ? page.entries : [], latestUpdatedSeq: page.latestUpdatedSeq ?? afterUpdatedSeq,
      turn: { idle: turn.idle ?? true, inFlight: Boolean(turn.inFlight), queued: Number(turn.queued) || 0 } };
  }

  async interrupt(sessionId: string, reason: string): Promise<void> {
    await this.call("POST", `/v0/grokbot/sessions/${encodeURIComponent(sessionId)}/interrupt`, { reason });
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.key().trim()}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response: Awaited<ReturnType<GrokFetch>>;
    try {
      response = await this.fetch(`${this.base}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch (error) {
      throw new GrokBotError(0, error instanceof Error ? error.message : String(error));
    }
    const text = await response.text().catch(() => "");
    if (response.status < 200 || response.status >= 300) throw new GrokBotError(response.status, `HTTP ${response.status}`);
    try { return (text ? JSON.parse(text) : {}) as T; } catch { throw new GrokBotError(response.status, "Malformed reply"); }
  }
}
