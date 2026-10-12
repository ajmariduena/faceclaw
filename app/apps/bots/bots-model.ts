// No NativeScript imports: the home card, tests and tools/headless-render load this directly.
import { formatAge } from "../paseo/paseo-model";
import { KEY_REJECTED, OFFLINE, type BotState } from "../../assistant/grokbot/grokbot-hub";
import type { ChatLine } from "../../graphics/terminal-painter";
import type { BotFace } from "./bot-mark";

/** What the glasses call the one Grok Bot session they talk to, whatever its name in Cursor. */
export const BOT_TITLE = "Grok Bot";

export type BotsHubView = {
  readonly configured: boolean;
  readonly error: string;
  readonly defaultBot: string;
  list(): readonly BotState[];
};

export function elapsedClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function workingLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `working 0:${String(seconds).padStart(2, "0")}`;
  if (seconds < 3600) return `working ${Math.floor(seconds / 60)} min`;
  return `working ${Math.floor(seconds / 3600)} h`;
}

/** Grok Bot writes chat-app markdown; the glasses only draw plain text. */
export function plainText(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\((?:[^()\s]|\([^)\s]*\))*\)/g, "$1")
    .replace(/https?:\/\/(?:www\.)?([^/\s)]+)\S*/g, "$1")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, "· ")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function chatLines(bot: BotState, hubError: string): ChatLine[] {
  const lines: ChatLine[] = bot.messages.map(message => message.role === "user"
    ? { role: "user", text: message.text } : { role: "assistant", text: plainText(message.text) });
  if (bot.stopped) lines.push({ role: "assistant", text: "> Stopped", action: true });
  if (lines.length && hubError) lines.push({ role: "assistant", text: `> ${hubError === KEY_REJECTED ? "Cursor key rejected · fix on phone" : `${hubError} · retrying`}`, action: true });
  return lines;
}

export function chatEmptyMessage(bot: BotState, hub: BotsHubView): string {
  if (!hub.configured) return "Add a Cursor key on the phone";
  if (hub.error === KEY_REJECTED) return "Cursor key rejected · fix on phone";
  if (hub.error === OFFLINE && !bot.loaded) return `${OFFLINE} · retrying`;
  if (!bot.loaded) return "Loading…";
  if (bot.newEmpty) return "New empty bot · name not found";
  return `Ask ${BOT_TITLE} anything`;
}

/** The home card: the bot's face, its last reply (or, while it works, what it is working on, dim) and how old that is; `status` when there is no line. */
export type BotsGlance = { face: BotFace; line: string; lineDim: boolean; age: string; status: string };

export function botsGlance(hub: BotsHubView, nowMs: number): BotsGlance {
  const empty = (status: string): BotsGlance => ({ face: "idle", line: "", lineDim: false, age: "", status });
  if (!hub.configured) return empty("Setup required");
  if (hub.error === KEY_REJECTED) return empty(KEY_REJECTED);
  const bot = hub.list().find(candidate => candidate.name === hub.defaultBot);
  const status = hub.error === OFFLINE ? OFFLINE : `Ask ${BOT_TITLE} anything`;
  if (!bot) return empty(status);
  const face: BotFace = bot.unread ? "unread" : bot.working ? "working" : "idle";
  if (bot.working && bot.latest) {
    const latest = bot.latest;
    return { face, line: latest.role === "user" ? latest.text : plainText(latest.text), lineDim: true,
      age: workingLabel(nowMs - bot.workingSince), status };
  }
  const reply = bot.latestBot;
  if (!reply) return { ...empty(status), face };
  return { face, line: plainText(reply.text), lineDim: false, age: formatAge(reply.createdAtMs || nowMs, nowMs), status };
}
