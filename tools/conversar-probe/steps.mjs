// Decide, search and write steps shared by the probes.
// Keys come from the environment: OPENROUTER_API_KEY, PARALLEL_API_KEY, BRAVE_API_KEY.
export const now = () => performance.now();

export async function jev(text) {
  const t0 = now();
  const res = await fetch('https://openrouter.ai/api/alpha/decisions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'typesafe/jev-1.13',
      state: { utterance: text },
      questions: {
        lookup: {
          type: 'noul',
          instructions: 'Would a short fact from the web help the listener right now?',
          criteria: {
            true: 'Mentions a specific person, company, product, place, number, date, statistic, claim that can be checked, or asks a factual question.',
            false: 'Small talk, feelings, personal anecdotes, filler or anything a web search cannot add to.',
          },
        },
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`jev ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return { ms: now() - t0, p: body.answers?.lookup?.noul, cost: body.usage?.cost };
}

export async function parallel(text, mode) {
  const t0 = now();
  const res = await fetch('https://api.parallel.ai/v1/search', {
    method: 'POST',
    headers: { 'x-api-key': process.env.PARALLEL_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, objective: text, search_queries: [text], max_chars_total: 4000 }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`parallel ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  const snippets = (body.results ?? []).slice(0, 4).map((r) => `${r.title}: ${(r.excerpts ?? []).join(' ').slice(0, 500)}`);
  return { ms: now() - t0, snippets };
}

export async function brave(text) {
  const t0 = now();
  const url = `https://api.search.brave.com/res/v1/web/search?count=5&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY, Accept: 'application/json' } });
  const body = await res.json();
  if (!res.ok) throw new Error(`brave ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  const snippets = (body.web?.results ?? []).slice(0, 4).map((r) => `${r.title}: ${r.description}`);
  return { ms: now() - t0, snippets };
}

export async function write(text, snippets) {
  const t0 = now();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.WRITER ?? 'openai/gpt-oss-120b',
      provider: { order: ['Cerebras'], allow_fallbacks: false },
      reasoning: { effort: 'low' },
      max_tokens: 400,
      messages: [
        { role: 'system', content: 'Someone just said the utterance in a live conversation. Using only the sources, give the single most useful fact about what the utterance mentions (confirm or correct a claim, answer a question, identify a name). ONE line, max 90 characters, same language as the utterance, no markdown, no preamble. If the sources say nothing relevant, reply exactly: -' },
        { role: 'user', content: `Utterance: ${text}\n\nSources:\n${snippets.join('\n')}` },
      ],
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`writer ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return { ms: now() - t0, line: body.choices?.[0]?.message?.content?.trim(), provider: body.provider };
}

export async function perplexityFast(text) {
  const t0 = now();
  const res = await fetch('https://api.perplexity.ai/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: text, search_type: 'fast', max_results: 5 }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`perplexity ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  const snippets = (body.results ?? []).map((r) => `${r.title}: ${(r.snippet ?? '').slice(0, 500)}`);
  return { ms: now() - t0, snippets };
}
