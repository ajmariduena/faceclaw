/**
 * One heard sentence → at most one fact line (research/conversar/plan.md):
 * Jev decides whether a fact would help while the search already runs, then
 * gpt-oss-120b on Cerebras writes the line from the results. Each step calls
 * its provider directly when that key is set, otherwise through OpenRouter.
 * The conversation so far rides along, so "¿y cuántos habitantes tiene?"
 * still knows which city, and a fact already shown is not shown again.
 */
import { webSearch as search, type Post, type SearchResult } from "../../assistant/web-search";

export type { Post };
export type Fact = { topic: string; source: string; text: string };
export type FactKeys = { typesafe: string; cerebras: string; openRouter: string; perplexity: string; brave: string };
/** What was said before this sentence, oldest first, and the facts already on screen. */
export type FactContext = {
  earlier: readonly string[];
  shown: readonly string[];
  /** ISO country of the phone, for names that exist in several places. */
  region?: string;
  /** True once a later sentence's fact is on screen, so this one would be dropped: skip the write. */
  isStale?: () => boolean;
};

const LOOKUP_THRESHOLD = 0.6;
const MIN_WORDS = 3;
const SHORT_FOLLOW_UP_WORDS = 7;
/** The search with the year is extra: once the others are back it gets this long, then is dropped. */
const YEAR_SEARCH_GRACE_MS = 150;
const MAX_FACT_CHARS = 90;
const CONTEXT_SENTENCES = 6;
const SHOWN_FOR_DECIDE = 3;
/** Share of a new fact's words already in a shown fact above which it counts as the same fact. */
const SAME_FACT_OVERLAP = 0.7;
const MAX_RESULTS = 8;

export async function lookupFact(sentence: string, language: string, keys: FactKeys, post: Post, context: FactContext = { earlier: [], shown: [] }): Promise<Fact | null> {
  if (wordCount(sentence) < MIN_WORDS) return null;
  const earlier = context.earlier.slice(-CONTEXT_SENTENCES);
  // A second search with the previous sentence costs no time (both run beside Jev) and resolves "it", "there", "he".
  const withPrevious = earlier.length ? `${earlier[earlier.length - 1]} ${sentence}` : "";
  // Searched alone, "¿Ahorita los regresaron?" finds what "ahorita" means.
  const main = !withPrevious ? [sentence] : wordCount(sentence) <= SHORT_FOLLOW_UP_WORDS ? [withPrevious] : [sentence, withPrevious];
  // With the year, the search also finds what is true now: alone, "¿hay pandas en Japón?" only found a 2023 page.
  const lookups = [...main, `${main[main.length - 1]} ${new Date().getFullYear()}`].map((query) => search(query, context.region, keys, post).catch(() => [] as SearchResult[]));
  const withYear = lookups.pop() as Promise<SearchResult[]>;
  const searching = Promise.all(lookups).then(async (lists) => mergeResults([...lists, await within(withYear, YEAR_SEARCH_GRACE_MS, [])]));
  const p = await decide(sentence, earlier, context.shown.slice(-SHOWN_FOR_DECIDE), keys, post).catch(() => 0);
  if (p < LOOKUP_THRESHOLD) return null;
  const results = await searching;
  if (!results.length || context.isStale?.()) return null;
  const fact = await write(sentence, language, results, { ...context, earlier }, keys, post);
  return fact && !context.shown.some((shown) => sameFact(fact.text, shown)) ? fact : null;
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) ?? []);
}

export function sameFact(text: string, shown: string): boolean {
  const a = words(text);
  const b = words(shown);
  if (!a.size) return true;
  let common = 0;
  for (const word of a) if (b.has(word)) common++;
  return common / a.size >= SAME_FACT_OVERLAP;
}

function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

function mergeResults(lists: SearchResult[][]): SearchResult[] {
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (let i = 0; merged.length < MAX_RESULTS && lists.some((list) => i < list.length); i++) {
    for (const list of lists) {
      const result = list[i];
      if (result && !seen.has(result.url)) {
        seen.add(result.url);
        merged.push(result);
      }
    }
  }
  return merged.slice(0, MAX_RESULTS);
}

const LOOKUP_INSTRUCTIONS = "Does the latest utterance ask or claim something new that a web search would answer, and is it not already answered by a fact on screen?";
const LOOKUP_CRITERIA = {
  true: "Asks a factual question, or states a checkable fact (name, place, number, date) that the conversation has not already settled.",
  false: "Reads back or repeats a fact already shown, agrees or reacts (sí, ajá, obvio, ¿en serio?), points at something on a screen or map (mira, aquí está, esto es), small talk, feelings, or anything a web search cannot add to.",
};

async function decide(sentence: string, earlier: readonly string[], shown: readonly string[], keys: FactKeys, post: Post): Promise<number> {
  const direct = !!keys.typesafe;
  const { status, json } = await post(
    direct ? "https://api.typesafe.ai/v1/systemone" : "https://openrouter.ai/api/alpha/decisions",
    { Authorization: `Bearer ${direct ? keys.typesafe : keys.openRouter}`, "Content-Type": "application/json" },
    JSON.stringify({
      model: direct ? "jev-latest" : "typesafe/jev-1.13",
      state: direct
        ? [...earlier.map((line) => `Earlier: ${line}`), ...shown.map((fact) => `Fact on screen: ${fact}`), `Latest utterance: ${sentence}`].join("\n")
        : { earlier: earlier.join("\n"), facts_on_screen: shown.join("\n"), utterance: sentence },
      questions: { lookup: { type: "noul", instructions: LOOKUP_INSTRUCTIONS, criteria: LOOKUP_CRITERIA } },
    }),
    2000,
  );
  if (status !== 200) throw new Error(`decide ${status}`);
  return Number((json as { answers?: { lookup?: { noul?: number } } }).answers?.lookup?.noul ?? 0);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${WEEKDAYS[now.getDay()]}, ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function write(sentence: string, language: string, results: SearchResult[], context: FactContext, keys: FactKeys, post: Post): Promise<Fact | null> {
  const languageName = language === "en" ? "English" : "Spanish";
  const messages = [
    { role: "system", content: `Today is ${today()}. Sources can be older than today: never present something that has already ended as current, and count ages and durations from today. Someone just said the utterance in a live conversation. Using only the numbered sources, give the single most useful fact about what it mentions: confirm or correct a claim, answer a question, or identify a name. Use the earlier conversation to understand what the utterance refers to. Never repeat a fact already shown; if nothing new is left, reply -. State only what a source says outright: no inferred routes or flights, and do not contradict the speaker unless a source says the opposite. When sources give different figures, give the range; when they disagree on whether something is still true, trust the most recent dated one. If the sources are about a different subject than the conversation, reply -. Read the utterance in the speaker's dialect ("ahorita" means now) and never explain what a word they used means. Never mention sources or source numbers in the fact.${context.region ? ` The listener is in country ${context.region}: when a name could mean several places or things, prefer the one nearest to them.` : ""} Reply on one line as: topic | fact | one source number. The topic is 1 to 3 words. The fact is one complete sentence in ${languageName} that names its subject, at most ${MAX_FACT_CHARS} characters, no markdown. If the sources say nothing relevant, reply exactly: -` },
    { role: "user", content: `${context.earlier.length ? `Earlier conversation:\n${context.earlier.join("\n")}\n\n` : ""}${context.shown.length ? `Already shown:\n${context.shown.join("\n")}\n\n` : ""}Utterance: ${sentence}\n\nSources:\n${results.map((r, i) => `${i + 1}. ${r.date ? `(${r.date}) ` : ""}${r.title}: ${r.snippet}`).join("\n")}` },
  ];
  const attempts: [string, string, object][] = [];
  if (keys.cerebras) attempts.push(["https://api.cerebras.ai/v1/chat/completions", keys.cerebras, { model: "gpt-oss-120b", reasoning_effort: "low" }]);
  if (keys.openRouter) attempts.push(["https://openrouter.ai/api/v1/chat/completions", keys.openRouter, { model: "openai/gpt-oss-120b", provider: { order: ["Cerebras"], allow_fallbacks: false }, reasoning: { effort: "low" } }]);
  for (const [url, key, model] of attempts) {
    const response = await post(url, { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, JSON.stringify({ ...model, max_tokens: 400, messages }), 4000).catch(() => null);
    if (response?.status !== 200) continue;
    const line = String((response.json as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "").trim();
    return parseFactLine(line, results.map((r) => r.url));
  }
  return null;
}

const MAX_TOPIC_CHARS = 40;
/** The writer sometimes cites "según la fuente 1" inside the sentence. */
const SOURCE_MENTION = /,?\s*\(?(según|segun|de acuerdo con|according to|per) (la )?(fuente|source) \d+\)?(?=[.\s]*$)/i;

/** "topic | fact | n"; the model sometimes drops the topic, leaving "fact | n". */
export function parseFactLine(line: string, urls: string[]): Fact | null {
  const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
  const sourceNumber = /^\d+(\s*,\s*\d+)*$/.test(parts[parts.length - 1] ?? "") ? parseInt(parts.pop() ?? "", 10) : 0;
  const topic = parts[0] ?? "";
  const text = (parts.pop() ?? "").replace(SOURCE_MENTION, "").replace(/【[^】]*】/g, "").trim();
  if (!/[A-Za-zÀ-ÿ]/.test(text) || /^(fuente|source)\s*\d+\.?$/i.test(text)) return null;
  const url = urls[sourceNumber - 1] ?? urls[0] ?? "";
  return { topic: topic.length <= MAX_TOPIC_CHARS ? topic : "", text, source: hostname(url) };
}

function hostname(url: string): string {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1].replace(/^www\./, "") : "";
}
