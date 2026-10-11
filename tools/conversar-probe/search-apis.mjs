// Compares search API latency on conversation sentences; also checks whether the writer
// still finds the fact in each API's snippets.
// Keys: PERPLEXITY_API_KEY, PARALLEL_API_KEY, BRAVE_API_KEY, FIRECRAWL_API_KEY, TINYFISH_API_KEY, EXA_API_KEY.
import { now, write } from './steps.mjs';

const queries = [
  'Oye, ¿sabías que Cerebras acaba de sacar el CS-4?',
  '¿Cuántos habitantes tiene Guayaquil más o menos?',
  'I think the Golden Gate Bridge opened in 1937, right?',
  'Who is the CEO of Anthropic these days?',
  'Dicen que la Independencia de Guayaquil fue en 1820.',
  '¿Qué altura tiene el Chimborazo?',
];
const RUNS = Number(process.env.RUNS ?? 3);

async function timed(fn) {
  const t0 = now();
  try {
    const snippets = await fn();
    return { ms: now() - t0, snippets };
  } catch (e) {
    return { ms: NaN, snippets: [], error: e.message.slice(0, 160) };
  }
}

async function json(res, name) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${name} ${res.status}: ${JSON.stringify(body).slice(0, 160)}`);
  return body;
}

const apis = {
  'perplexity fast': async (q) => {
    const body = await json(await fetch('https://api.perplexity.ai/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, search_type: 'fast', max_results: 5 }),
    }), 'perplexity');
    return (body.results ?? []).map((r) => `${r.title}: ${(r.snippet ?? '').slice(0, 500)}`);
  },
  'parallel turbo': async (q) => {
    const body = await json(await fetch('https://api.parallel.ai/v1/search', {
      method: 'POST',
      headers: { 'x-api-key': process.env.PARALLEL_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'turbo', objective: q, search_queries: [q], max_chars_total: 4000 }),
    }), 'parallel');
    return (body.results ?? []).slice(0, 5).map((r) => `${r.title}: ${(r.excerpts ?? []).join(' ').slice(0, 500)}`);
  },
  'parallel fast': async (q) => {
    const body = await json(await fetch('https://api.parallel.ai/v1/search', {
      method: 'POST',
      headers: { 'x-api-key': process.env.PARALLEL_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'fast', objective: q, search_queries: [q], max_chars_total: 4000 }),
    }), 'parallel');
    return (body.results ?? []).slice(0, 5).map((r) => `${r.title}: ${(r.excerpts ?? []).join(' ').slice(0, 500)}`);
  },
  brave: async (q) => {
    const body = await json(await fetch(`https://api.search.brave.com/res/v1/web/search?count=5&q=${encodeURIComponent(q)}`, {
      headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY, Accept: 'application/json' },
    }), 'brave');
    return (body.web?.results ?? []).map((r) => `${r.title}: ${r.description}`);
  },
  firecrawl: async (q) => {
    const body = await json(await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, limit: 5 }),
    }), 'firecrawl');
    return (body.data?.web ?? []).map((r) => `${r.title}: ${r.description ?? ''}`);
  },
  tinyfish: async (q) => {
    const body = await json(await fetch(`https://api.search.tinyfish.ai?query=${encodeURIComponent(q)}`, {
      headers: { 'X-API-Key': process.env.TINYFISH_API_KEY },
    }), 'tinyfish');
    return (body.results ?? []).slice(0, 5).map((r) => `${r.title}: ${r.snippet ?? r.description ?? ''}`);
  },
  'exa instant': async (q) => {
    const body = await json(await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'x-api-key': process.env.EXA_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, type: 'instant', numResults: 5, contents: { highlights: true } }),
    }), 'exa');
    return (body.results ?? []).map((r) => `${r.title}: ${(r.highlights ?? []).join(' ').slice(0, 500)}`);
  },
};

const rows = Object.fromEntries(Object.keys(apis).map((k) => [k, []]));
for (let run = 0; run < RUNS; run++) {
  for (const q of queries) {
    for (const [name, fn] of Object.entries(apis)) {
      const r = await timed(() => fn(q));
      if (run === 0 && r.snippets.length) r.line = (await write(q, r.snippets)).line;
      rows[name].push({ q, ...r });
      // Brave's free plan allows one request per second.
      if (name === 'brave') await new Promise((ok) => setTimeout(ok, 1000));
    }
  }
}

const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
for (const [name, rs] of Object.entries(rows)) {
  const errors = rs.filter((r) => r.error);
  const facts = rs.filter((r) => r.line && r.line !== '-').length;
  console.log(`${name.padEnd(16)} median ${`${Math.round(median(rs.map((r) => r.ms)))}`.padStart(5)} ms | facts ${facts}/${queries.length} | errors ${errors.length}${errors[0] ? ` (${errors[0].error})` : ''}`);
  for (const r of rs.filter((r) => r.line)) console.log(`      ${r.q.slice(0, 34).padEnd(34)} → ${r.line}`);
}
