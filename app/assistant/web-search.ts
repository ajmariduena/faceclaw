/**
 * Fast web search shared by Live facts and Instant: Perplexity Fast Search,
 * with Brave started when Perplexity has not answered within a second.
 */

export type Post = (url: string, headers: Record<string, string>, body: string | null, timeoutMs: number) => Promise<{ status: number; json: unknown }>;
export type SearchResult = { title: string; url: string; snippet: string; date?: string };
export type SearchKeys = { perplexity: string; brave: string };

/** Brave starts when Perplexity has not answered by then; the first non-empty list wins. */
const SEARCH_HEDGE_MS = 1000;

export async function webSearch(query: string, region: string | undefined, keys: SearchKeys, post: Post): Promise<SearchResult[]> {
  const brave = () => (keys.brave ? braveSearch(query, keys.brave, post).catch(() => [] as SearchResult[]) : Promise.resolve([] as SearchResult[]));
  if (!keys.perplexity) return brave();
  const primary = perplexitySearch(query, region, keys.perplexity, post).catch(() => [] as SearchResult[]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), SEARCH_HEDGE_MS); });
  const first = await Promise.race([primary, slow]);
  clearTimeout(timer);
  if (first?.length) return first;
  if (first) return brave();
  return firstNonEmpty([primary, brave()]);
}

async function perplexitySearch(query: string, region: string | undefined, key: string, post: Post): Promise<SearchResult[]> {
  const { status, json } = await post("https://api.perplexity.ai/search", { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    JSON.stringify({ query, search_type: "fast", max_results: 5, ...(region ? { country: region } : {}) }), 2500);
  const results = (json as { results?: { title?: string; url?: string; snippet?: string; date?: string }[] }).results ?? [];
  return status === 200 ? results.map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: (r.snippet ?? "").slice(0, 500), ...(r.date ? { date: r.date } : {}) })) : [];
}

async function braveSearch(query: string, key: string, post: Post): Promise<SearchResult[]> {
  const { status, json } = await post(`https://api.search.brave.com/res/v1/web/search?count=5&q=${encodeURIComponent(query)}`,
    { "X-Subscription-Token": key, Accept: "application/json" }, null, 2000);
  if (status !== 200) return [];
  const results = (json as { web?: { results?: { title?: string; url?: string; description?: string; page_age?: string | null }[] } }).web?.results ?? [];
  return results.map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: r.description ?? "", ...(r.page_age ? { date: r.page_age.slice(0, 10) } : {}) }));
}

function firstNonEmpty(lists: Promise<SearchResult[]>[]): Promise<SearchResult[]> {
  return new Promise((resolve) => {
    let pending = lists.length;
    for (const list of lists) {
      void list.then((results) => {
        if (results.length) resolve(results);
        else if (--pending === 0) resolve([]);
      });
    }
  });
}
