// No NativeScript imports: the home card, tests and tools/headless-render load this directly.
import { formatAge } from "../paseo/paseo-model";
import { KEY_REJECTED, OFFLINE, type BotState } from "../../assistant/grokbot/grokbot-hub";
import type { ChatLine } from "../../graphics/terminal-painter";

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
  if (bot.stopped) lines.push({ role: "assistant", text: `> Stopped · ${bot.name}`, action: true });
  if (lines.length && hubError) lines.push({ role: "assistant", text: `> ${hubError === KEY_REJECTED ? "Cursor key rejected · fix on phone" : `${hubError} · retrying`}`, action: true });
  return lines;
}

export function chatEmptyMessage(bot: BotState, hub: BotsHubView): string {
  if (!hub.configured) return "Add a Cursor key on the phone";
  if (hub.error === KEY_REJECTED) return "Cursor key rejected · fix on phone";
  if (hub.error === OFFLINE && !bot.loaded) return `${OFFLINE} · retrying`;
  if (!bot.loaded) return "Loading…";
  if (bot.newEmpty) return "New empty bot · name not found";
  return `Ask ${bot.name} anything`;
}

export type BotsGlanceUpdate = { bot: string; who: string; line: string };
export type BotsGlance = { updates: BotsGlanceUpdate[]; status: string };

export const BOTS_GLANCE_UPDATES = 2;

export function botsGlance(hub: BotsHubView, nowMs: number): BotsGlance {
  if (!hub.configured) return { updates: [], status: "Setup required" };
  if (hub.error === KEY_REJECTED) return { updates: [], status: KEY_REJECTED };
  const rank = (bot: BotState) => bot.unread ? 0 : bot.working ? 1 : 2;
  const updates = hub.list().filter(bot => bot.latest)
    .sort((a, b) => rank(a) - rank(b) || b.latest!.createdAtMs - a.latest!.createdAtMs)
    .slice(0, BOTS_GLANCE_UPDATES)
    .map(bot => {
      const latest = bot.latest!;
      const when = bot.working ? workingLabel(nowMs - bot.workingSince) : formatAge(latest.createdAtMs || nowMs, nowMs);
      return { bot: bot.name, who: `${bot.name} · ${when}`, line: latest.role === "user" ? `You: ${latest.text}` : plainText(latest.text) };
    });
  return { updates, status: hub.error === OFFLINE && !updates.length ? OFFLINE : `Ask ${hub.defaultBot} anything` };
}
