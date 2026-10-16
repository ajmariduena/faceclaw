/**
 * The tools Instant offers the model: a few small actions from the shared
 * registry, web search, notes, and handing a task to Grok Bot. Actions that
 * succeed are confirmed with a fixed sentence instead of a second model call.
 */
import type { ToolSpec } from "../tool-registry";
import type { ChatTool } from "./instant-llm";

/** Registry tools Instant may call; everything else (windows, folders, calendar edits) stays out. */
export const REGISTRY_TOOLS = [
  "timer.set", "timer.cancel", "alarm.set", "alarm.delete",
  "media.play_pause", "media.next", "notifications.dismiss",
  "nav.start_navigation", "nav.stop_navigation",
  "roam.add_todo", "roam.read_todos", "apps.launch",
] as const;

export const WEB_SEARCH = "web_search";
export const REMEMBER = "remember";
export const ASK_GROK_BOT = "ask_grok_bot";

const LOCAL_TOOLS: ChatTool[] = [
  { type: "function", function: { name: WEB_SEARCH, description: "Search the web for anything recent, live, local or that you are not sure about.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: REMEMBER, description: "Save a lasting fact about the user when they ask you to remember it (where they live, a preference, a name).", parameters: { type: "object", properties: { note: { type: "string", description: "The fact, as one short sentence." } }, required: ["note"] } } },
  { type: "function", function: { name: ASK_GROK_BOT, description: "Hand a complex task to Grok Bot, the user's slower agent with email, accounts, bookings, purchases, finances, code and deep research. Use it for anything that needs more than a quick answer or a small action.", parameters: { type: "object", properties: { task: { type: "string", description: "The task, complete and in the user's words." } }, required: ["task"] } } },
];

/** OpenAI tool names allow no dots: "timer.set" travels as "timer__set". */
export function toModelName(name: string): string { return name.replace(/\./g, "__"); }
export function fromModelName(name: string): string { return name.replace(/__/g, "."); }

export function instantTools(registry: readonly ToolSpec[]): ChatTool[] {
  const allowed = new Set<string>(REGISTRY_TOOLS);
  const actions = registry.filter((spec) => allowed.has(spec.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((spec): ChatTool => ({ type: "function", function: { name: toModelName(spec.name), description: spec.description, parameters: spec.inputSchema } }));
  return [...LOCAL_TOOLS, ...actions];
}

type Lang = "es" | "en";

function duration(args: Record<string, unknown>, lang: Lang): string {
  const parts: string[] = [];
  const add = (value: unknown, es: [string, string], en: [string, string]) => {
    const n = Number(value) || 0;
    if (n > 0) parts.push(`${n} ${lang === "es" ? es[n === 1 ? 0 : 1] : en[n === 1 ? 0 : 1]}`);
  };
  add(args.hours, ["hora", "horas"], ["hour", "hours"]);
  add(args.minutes, ["minuto", "minutos"], ["minute", "minutes"]);
  add(args.seconds, ["segundo", "segundos"], ["second", "seconds"]);
  return parts.join(lang === "es" ? " y " : " and ");
}

/** The sentence shown once an action succeeded, or null when the model should phrase the result itself. */
export function confirmation(tool: string, args: Record<string, unknown>, language: string): string | null {
  const lang: Lang = language === "en" ? "en" : "es";
  const es = lang === "es";
  switch (tool) {
    case "timer.set": {
      const length = duration(args, lang);
      return es ? `Listo, timer de ${length}.` : `Done, ${length} timer.`;
    }
    case "timer.cancel": return es ? "Listo, cancelé el timer." : "Done, timer cancelled.";
    case "alarm.set": return es ? `Listo, alarma a las ${String(args.time ?? "")}.` : `Done, alarm at ${String(args.time ?? "")}.`;
    case "alarm.delete": return es ? "Listo, borré la alarma." : "Done, alarm deleted.";
    case "media.play_pause": return es ? "Listo." : "Done.";
    case "media.next": return es ? "Siguiente canción." : "Next song.";
    case "notifications.dismiss": return es ? "Listo, la quité." : "Done, dismissed.";
    case "nav.start_navigation": return es ? `Vamos a ${String(args.destination ?? "")}.` : `Heading to ${String(args.destination ?? "")}.`;
    case "nav.stop_navigation": return es ? "Listo, terminé la ruta." : "Done, route ended.";
    case "roam.add_todo": return es ? "Anotado." : "Noted.";
    case "apps.launch": return es ? "Abriendo." : "Opening.";
    case REMEMBER: return es ? "Lo recordaré." : "I'll remember that.";
    case ASK_GROK_BOT: return es ? "Se lo pasé a Grok Bot; te aviso cuando responda." : "I passed it to Grok Bot; you'll hear back soon.";
    default: return null;
  }
}
