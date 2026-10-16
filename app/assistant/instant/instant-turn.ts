/**
 * One Instant question, from text to the answer on screen
 * (research/instant-chat/plan.md): an exact command runs without a model;
 * otherwise the providers race, web search starts beside them on the raw
 * question, and an action that succeeds is confirmed without a second call.
 */
import type { ToolResult } from "../tool-registry";
import { webSearch, type Post, type SearchKeys, type SearchResult } from "../web-search";
import type { InstantChat } from "./instant-chat";
import { chatOnce, type ChatMessage, type ChatTarget, type ChatTool, type SseOpener, type ToolCall } from "./instant-llm";
import { matchShortcut } from "./instant-shortcuts";
import { ASK_GROK_BOT, confirmation, fromModelName, REMEMBER, WEB_SEARCH } from "./instant-tools";

export type TurnDeps = {
  open: SseOpener;
  post: Post;
  targets: ChatTarget[];
  searchKeys: SearchKeys;
  region?: string;
  tools: ChatTool[];
  chat: InstantChat;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  /** Resolves to a reason when the message did not go through. */
  askGrokBot(task: string): Promise<string | null>;
  clock(): string;
  now(): number;
};

export type TurnInput = { question: string; language: string; context: Promise<string> };
export type TurnPhase = "thinking" | "searching" | "acting";
export type TurnOutcome = {
  answer: string;
  firstMs: number;
  totalMs: number;
  route: "shortcut" | "model" | "action" | "search" | "grok-bot" | "error";
  winner?: string;
  tools: string[];
};
export type TurnHandle = { result: Promise<TurnOutcome>; cancel(): void };

const MAX_ROUNDS = 3;
const DEADLINE_MS = 6000;
/** How long the answer waits for the context gathered when the mic opened. */
const CONTEXT_WAIT_MS = 150;

const RULES = [
  "You are Instant, a fast voice assistant shown as text on the user's smart glasses.",
  "Reply in the language of the question, in plain text: no markdown, no lists, no links, no emoji.",
  "Answer first, in one or two short sentences of at most 100 characters each. Never cut a sentence short.",
  "Use the context block for the time, date, weather, calendar, timers, music, notifications and agents; do not call a tool for what it already says.",
  "Call web_search for anything recent, live, local, or that you are not sure about, and answer only from what it returns. Never invent numbers or dates.",
  "For complex tasks (email, bookings, purchases, finances, code, research that needs several steps) call ask_grok_bot with the whole task instead of trying yourself.",
  "Resolve relative dates (tomorrow, on Thursday) from today's date in the context.",
].join("\n");

export function systemPrompt(chat: InstantChat): string {
  return chat.notes.length ? `${RULES}\n\nWhat the user asked you to remember:\n${chat.notes.map((note) => `- ${note}`).join("\n")}` : RULES;
}

/** System, notes and summary first and unchanged between turns, so the providers' prompt caches hit. */
export function promptMessages(chat: InstantChat, nowMs: number, context: string, question: string): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(chat) }];
  if (chat.summary) messages.push({ role: "system", content: `Earlier in this chat:\n${chat.summary}` });
  for (const turn of chat.turnsForPrompt(nowMs)) {
    messages.push({ role: "user", content: turn.question }, { role: "assistant", content: turn.answer });
  }
  messages.push({ role: "user", content: context ? `[Context]\n${context}\n\n[Question]\n${question}` : question });
  return messages;
}

/** Glasses show plain sentences: markdown and links from a model that slipped are removed. */
export function plainAnswer(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function formatResults(results: SearchResult[]): string {
  if (!results.length) return "No results.";
  return results.slice(0, 6).map((r, i) => `${i + 1}. ${r.title}${r.date ? ` (${r.date})` : ""}: ${r.snippet}`).join("\n");
}

function parseArgs(call: ToolCall): Record<string, unknown> {
  try {
    const value = JSON.parse(call.function.arguments || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    void promise.then((value) => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}

export function runTurn(input: TurnInput, deps: TurnDeps, onText: (text: string) => void, onPhase: (phase: TurnPhase) => void): TurnHandle {
  let cancelled = false;
  let cancelStream = () => {};
  const t0 = deps.now();
  const tools: string[] = [];
  const outcome = (answer: string, route: TurnOutcome["route"], firstMs: number, winner?: string): TurnOutcome =>
    ({ answer, route, firstMs, totalMs: deps.now() - t0, winner, tools });

  const run = async (): Promise<TurnOutcome> => {
    const question = input.question.trim();
    const spanish = es(input.language);
    const shortcut = matchShortcut(question);
    if (shortcut?.kind === "time") return outcome(spanish ? `Son las ${deps.clock()}.` : `It's ${deps.clock()}.`, "shortcut", 0);
    if (shortcut?.kind === "tool") {
      tools.push(shortcut.tool);
      const result = await deps.callTool(shortcut.tool, shortcut.args);
      if (result.ok) return outcome(confirmation(shortcut.tool, shortcut.args, input.language) ?? (result.content ?? ""), "shortcut", 0);
    }

    const searchable = !!(deps.searchKeys.perplexity || deps.searchKeys.brave);
    const speculative = searchable ? webSearch(question, deps.region, deps.searchKeys, deps.post).catch(() => [] as SearchResult[]) : null;
    const context = await withTimeout(input.context, CONTEXT_WAIT_MS, "");
    const messages = promptMessages(deps.chat, t0, context, question);
    let route: TurnOutcome["route"] = "model";
    let firstMs = 0;
    let winner: string | undefined;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (cancelled) throw new Error("cancelled");
      const remaining = DEADLINE_MS - (deps.now() - t0);
      if (remaining <= 0) break;
      onPhase("thinking");
      const startedAt = deps.now() - t0;
      const call = chatOnce(deps.open, deps.targets, { messages, tools: deps.tools, maxTokens: 400 }, (text) => onText(plainAnswer(text)));
      cancelStream = () => call.cancel();
      const result = await Promise.race([call.result, new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining))]);
      if (!result) { call.cancel(); break; }
      if (!firstMs) firstMs = startedAt + result.firstMs;
      winner = result.winner;
      if (!result.toolCalls.length) return outcome(plainAnswer(result.text), route, firstMs, winner);

      messages.push({ role: "assistant", content: result.text || null, tool_calls: result.toolCalls });
      let done: string | null = null;
      for (const toolCall of result.toolCalls) {
        const name = fromModelName(toolCall.function.name);
        const args = parseArgs(toolCall);
        tools.push(name);
        let content: string;
        if (name === WEB_SEARCH) {
          onPhase("searching");
          route = "search";
          const ready = speculative ? await speculative : [];
          const results = ready.length ? ready : await webSearch(String(args.query ?? question), deps.region, deps.searchKeys, deps.post).catch(() => [] as SearchResult[]);
          content = formatResults(results);
        } else if (name === REMEMBER) {
          deps.chat.remember(String(args.note ?? ""));
          content = "Saved.";
          done ??= confirmation(REMEMBER, args, input.language);
        } else if (name === ASK_GROK_BOT) {
          route = "grok-bot";
          const failure = await deps.askGrokBot(String(args.task ?? question));
          content = failure ? `Not sent: ${failure}` : "Sent to Grok Bot.";
          done ??= failure ? (spanish ? `No pude pasárselo a Grok Bot: ${failure}.` : `Could not reach Grok Bot: ${failure}.`) : confirmation(ASK_GROK_BOT, args, input.language);
        } else {
          onPhase("acting");
          route = "action";
          const toolResult = await deps.callTool(name, args);
          content = toolResult.ok ? (toolResult.content ?? "Done.") : `Error: ${toolResult.error ?? "failed"}`;
          if (toolResult.ok) done ??= confirmation(name, args, input.language);
        }
        messages.push({ role: "tool", tool_call_id: toolCall.id, content });
      }
      if (done && result.toolCalls.every((c) => fromModelName(c.function.name) !== WEB_SEARCH)) return outcome(done, route, firstMs, winner);
    }
    return outcome(spanish ? "No alcancé a responder; inténtalo otra vez." : "I couldn't answer in time; try again.", "error", firstMs, winner);
  };

  const result = run().catch((error: unknown) => {
    if (cancelled) throw error;
    return outcome(es(input.language) ? "No pude responder ahora." : "I couldn't answer right now.", "error", 0);
  });
  return { result, cancel: () => { cancelled = true; cancelStream(); } };
}

function es(language: string): boolean { return language !== "en"; }

const SUMMARY_PROMPT = "Merge the earlier summary and the new conversation lines into one short summary (at most 120 words) of what the user asked, what they decided and any facts about them. Plain text, in the conversation's language.";

export function summarizer(open: SseOpener, targets: ChatTarget[]): (previous: string, transcript: string) => Promise<string> {
  return async (previous, transcript) => {
    const call = chatOnce(open, targets, { maxTokens: 600, messages: [
      { role: "system", content: SUMMARY_PROMPT },
      { role: "user", content: `${previous ? `Earlier summary:\n${previous}\n\n` : ""}New lines:\n${transcript}` },
    ] });
    return (await call.result).text;
  };
}
