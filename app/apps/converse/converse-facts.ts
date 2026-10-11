/**
 * One heard sentence → at most one fact line (research/conversar/plan.md):
 * Jev decides whether a fact would help while the search already runs, then
 * gpt-oss-120b on Cerebras writes the line from the results. Each step calls
 * its provider directly when that key is set, otherwise through OpenRouter.
 */

export type Fact = { topic: string; source: string; text: string };
export type FactKeys = { typesafe: string; cerebras: string; openRouter: string; perplexity: string; brave: string };
export type Post = (url: string, headers: Record<string, string>, body: string | null, timeoutMs: number) => Promise<{ status: number; json: unknown }>;
type SearchResult = { title: string; url: string; snippet: string };

const LOOKUP_THRESHOLD = 0.5;
const MIN_WORDS = 3;
const MAX_FACT_CHARS = 90;

export async function lookupFact(sentence: string, language: string, keys: FactKeys, post: Post): Promise<Fact | null> {
  if (sentence.trim().split(/\s+/).length < MIN_WORDS) return null;
  const searching = search(sentence, keys, post).catch(() => [] as SearchResult[]);
  const p = await decide(sentence, keys, post).catch(() => 0);
  if (p < LOOKUP_THRESHOLD) return null;
  const results = await searching;
  if (!results.length) return null;
  return write(sentence, language, results, keys, post);
}

const LOOKUP_INSTRUCTIONS = "Would a short fact from the web help the listener right now?";
const LOOKUP_CRITERIA = {
  true: "Mentions a specific person, company, product, place, number, date, statistic, claim that can be checked, or asks a factual question.",
  false: "Small talk, feelings, personal anecdotes, filler or anything a web search cannot add to.",
};

async function decide(sentence: string, keys: FactKeys, post: Post): Promise<number> {
  const direct = !!keys.typesafe;
  const { status, json } = await post(
    direct ? "https://api.typesafe.ai/v1/systemone" : "https://openrouter.ai/api/alpha/decisions",
    { Authorization: `Bearer ${direct ? keys.typesafe : keys.openRouter}`, "Content-Type": "application/json" },
    JSON.stringify({
      model: direct ? "jev-latest" : "typesafe/jev-1.13",
      state: direct ? sentence : { utterance: sentence },
      questions: { lookup: { type: "noul", instructions: LOOKUP_INSTRUCTIONS, criteria: LOOKUP_CRITERIA } },
    }),
    2000,
  );
  if (status !== 200) throw new Error(`decide ${status}`);
  return Number((json as { answers?: { lookup?: { noul?: number } } }).answers?.lookup?.noul ?? 0);
}

/** Perplexity Fast Search; Brave when it fails or is not set up. */
async function search(sentence: string, keys: FactKeys, post: Post): Promise<SearchResult[]> {
  if (keys.perplexity) {
    try {
      const { status, json } = await post("https://api.perplexity.ai/search", { Authorization: `Bearer ${keys.perplexity}`, "Content-Type": "application/json" },
        JSON.stringify({ query: sentence, search_type: "fast", max_results: 5 }), 2500);
      const results = (json as { results?: { title?: string; url?: string; snippet?: string }[] }).results ?? [];
      if (status === 200 && results.length) return results.map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: (r.snippet ?? "").slice(0, 500) }));
    } catch { /* falls through to Brave */ }
  }
  if (!keys.brave) return [];
  const { status, json } = await post(`https://api.search.brave.com/res/v1/web/search?count=5&q=${encodeURIComponent(sentence)}`,
    { "X-Subscription-Token": keys.brave, Accept: "application/json" }, null, 2000);
  if (status !== 200) return [];
  const results = (json as { web?: { results?: { title?: string; url?: string; description?: string }[] } }).web?.results ?? [];
  return results.map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: r.description ?? "" }));
}

async function write(sentence: string, language: string, results: SearchResult[], keys: FactKeys, post: Post): Promise<Fact | null> {
  const languageName = language === "en" ? "English" : "Spanish";
  const messages = [
    { role: "system", content: `Someone just said the utterance in a live conversation. Using only the numbered sources, give the single most useful fact about what it mentions: confirm or correct a claim, answer a question, or identify a name. Reply on one line as: topic | fact | source number. The topic is 1 to 3 words. The fact is one sentence in ${languageName}, at most ${MAX_FACT_CHARS} characters, no markdown. If the sources say nothing relevant, reply exactly: -` },
    { role: "user", content: `Utterance: ${sentence}\n\nSources:\n${results.map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join("\n")}` },
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

export function parseFactLine(line: string, urls: string[]): Fact | null {
  const parts = line.split("|").map((part) => part.trim());
  if (parts.length < 2 || !parts[1] || parts[1] === "-") return null;
  const url = urls[Number(parts[2]) - 1] ?? urls[0] ?? "";
  return { topic: parts[0], text: parts[1], source: hostname(url) };
}

function hostname(url: string): string {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1].replace(/^www\./, "") : "";
}
