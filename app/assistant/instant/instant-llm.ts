/**
 * OpenAI-format streaming chat for Instant, raced across providers: every
 * target starts at once, the first to stream anything wins and the rest are
 * cancelled (research/instant-chat/plan.md: p90 330 ms alone, ~190 ms raced).
 */
import type { SseListener } from "../../native/sse-types";

export type SseOpener = (url: string, body: string, headers: Record<string, string>, listener: SseListener) => { cancel(): void };

export type ChatTarget = { name: string; url: string; key: string; body: Record<string, unknown> };
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatTool = { type: "function"; function: { name: string; description: string; parameters: object } };
export type ChatResult = { text: string; toolCalls: ToolCall[]; winner: string; firstMs: number };

export type ChatRequest = { messages: ChatMessage[]; tools?: ChatTool[]; maxTokens?: number };
export type ChatHandlers = {
  onText?: (text: string) => void;
  onDone: (result: ChatResult) => void;
  onError: (message: string) => void;
};

export const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Cerebras direct when its key is set, and Groq through OpenRouter beside it; Cerebras through OpenRouter when that is all there is. */
export function chatTargets(keys: { cerebras: string; openRouter: string }): ChatTarget[] {
  const targets: ChatTarget[] = [];
  if (keys.cerebras) targets.push({ name: "cerebras", url: CEREBRAS_URL, key: keys.cerebras, body: { model: "gpt-oss-120b", reasoning_effort: "low" } });
  if (keys.openRouter) {
    targets.push({ name: "groq", url: OPENROUTER_URL, key: keys.openRouter, body: { model: "openai/gpt-oss-120b", provider: { order: ["groq"], allow_fallbacks: false }, reasoning: { effort: "low" } } });
    if (!keys.cerebras) targets.push({ name: "openrouter-cerebras", url: OPENROUTER_URL, key: keys.openRouter, body: { model: "openai/gpt-oss-120b", provider: { order: ["cerebras"], allow_fallbacks: false }, reasoning: { effort: "low" } } });
  }
  return targets;
}

function requestBody(target: ChatTarget, request: ChatRequest): string {
  return JSON.stringify({
    ...target.body,
    stream: true,
    max_tokens: request.maxTokens ?? 400,
    messages: request.messages,
    ...(request.tools?.length ? { tools: request.tools } : {}),
  });
}

type Stream = { cancel(): void };

/** One target; `onFirst` fires on the first streamed content or tool call. */
function streamOne(open: SseOpener, target: ChatTarget, request: ChatRequest, onFirst: () => boolean, handlers: ChatHandlers): Stream {
  let settled = false;
  let started = false;
  let text = "";
  let reason = "";
  let request_: Stream | null = null;
  const t0 = Date.now();
  let firstMs = 0;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    request_?.cancel();
    handlers.onError(message);
  };
  const begin = (): boolean => {
    if (started) return true;
    started = true;
    firstMs = Date.now() - t0;
    if (!onFirst()) { settled = true; request_?.cancel(); return false; }
    return true;
  };
  const finish = () => {
    if (settled) return;
    if (!reason && !text && !calls.size) { fail(`${target.name}: stream ended empty`); return; }
    settled = true;
    request_?.cancel();
    const toolCalls: ToolCall[] = [...calls.entries()].sort((a, b) => a[0] - b[0])
      .filter(([, call]) => call.name)
      .map(([index, call]) => ({ id: call.id || `call_${index}`, type: "function", function: { name: call.name, arguments: call.arguments || "{}" } }));
    handlers.onDone({ text, toolCalls, winner: target.name, firstMs });
  };
  const listener: SseListener = {
    onLine: (line) => {
      if (settled || !line.startsWith("data:")) return;
      const data = line.slice(5).trim();
      if (data === "[DONE]") { finish(); return; }
      if (!data) return;
      let event: any;
      try { event = JSON.parse(data); } catch { fail(`${target.name}: invalid stream`); return; }
      if (event.error) { fail(`${target.name}: ${String(event.error.message ?? "request failed")}`); return; }
      const choice = event.choices?.[0];
      if (!choice) return;
      const delta = choice.delta ?? {};
      if (delta.content) {
        if (!begin()) return;
        text += delta.content;
        handlers.onText?.(text);
      }
      for (const part of delta.tool_calls ?? []) {
        if (!begin()) return;
        const call = calls.get(part.index ?? 0) ?? { id: "", name: "", arguments: "" };
        call.id += part.id ?? "";
        call.name += part.function?.name ?? "";
        call.arguments += part.function?.arguments ?? "";
        calls.set(part.index ?? 0, call);
      }
      if (choice.finish_reason) reason = choice.finish_reason;
    },
    onHttpError: (code) => fail(`${target.name}: HTTP ${code}`),
    onComplete: finish,
    onFailure: (message) => fail(`${target.name}: ${message}`),
  };
  try {
    request_ = open(target.url, requestBody(target, request), { Authorization: `Bearer ${target.key}`, "Content-Type": "application/json" }, listener);
  } catch (error) {
    fail(`${target.name}: ${String(error)}`);
  }
  return { cancel() { settled = true; request_?.cancel(); } };
}

/**
 * Race every target; the first to stream wins and the others are cancelled.
 * A target that fails before anyone streamed just drops out of the race.
 */
export function raceChat(open: SseOpener, targets: ChatTarget[], request: ChatRequest, handlers: ChatHandlers): Stream {
  let winner = -1;
  let failures = 0;
  let lastError = "no chat provider";
  let done = false;
  const streams: Stream[] = [];
  const cancelOthers = (keep: number) => streams.forEach((stream, index) => { if (index !== keep) stream.cancel(); });
  targets.forEach((target, index) => {
    streams.push(streamOne(open, target, request, () => {
      if (winner >= 0 && winner !== index) return false;
      winner = index;
      cancelOthers(index);
      return true;
    }, {
      onText: (text) => { if (winner === index && !done) handlers.onText?.(text); },
      onDone: (result) => {
        if (done || (winner >= 0 && winner !== index)) return;
        done = true;
        cancelOthers(index);
        handlers.onDone(result);
      },
      onError: (message) => {
        if (done) return;
        lastError = message;
        if (winner === index) { done = true; handlers.onError(message); return; }
        if (winner < 0 && ++failures === targets.length) { done = true; handlers.onError(lastError); }
      },
    }));
  });
  if (!targets.length) { done = true; handlers.onError(lastError); }
  return { cancel() { done = true; streams.forEach((stream) => stream.cancel()); } };
}

export function chatOnce(open: SseOpener, targets: ChatTarget[], request: ChatRequest, onText?: (text: string) => void): { result: Promise<ChatResult>; cancel(): void } {
  let stream: Stream = { cancel() {} };
  const result = new Promise<ChatResult>((resolve, reject) => {
    stream = raceChat(open, targets, request, { onText, onDone: resolve, onError: (message) => reject(new Error(message)) });
  });
  return { result, cancel: () => stream.cancel() };
}

/**
 * Opens the TLS connections and fills each provider's prompt cache with the
 * fixed prefix (system prompt and tools) while the user is still talking.
 */
export function prewarm(open: SseOpener, targets: ChatTarget[], request: ChatRequest): void {
  for (const target of targets) {
    try {
      const stream = open(target.url, requestBody(target, { ...request, maxTokens: 1 }), { Authorization: `Bearer ${target.key}`, "Content-Type": "application/json" }, {
        onLine: () => {},
        onHttpError: () => {},
        onComplete: () => {},
        onFailure: () => {},
      });
      setTimeout(() => stream.cancel(), 5000);
    } catch { /* warming is best effort */ }
  }
}
