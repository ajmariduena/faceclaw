// Measures decide → search → write latency for live conversation facts.
// Keys come from the environment: OPENROUTER_API_KEY, PARALLEL_API_KEY, BRAVE_API_KEY.
const lines = [
  'Oye, ¿sabías que Cerebras acaba de sacar el CS-4?',
  'Ayer almorcé con mi mamá y estuvo rico.',
  '¿Cuántos habitantes tiene Guayaquil más o menos?',
  'Dicen que la Independencia de Guayaquil fue en 1820.',
  'Jajaja sí, qué locura, bueno sigamos.',
  'El otro día leí que OpenAI lanzó gpt-realtime-translate.',
];
const RUNS = Number(process.env.RUNS ?? 2);
const now = () => performance.now();

async function jev(text) {
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

async function parallel(text, mode) {
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

async function brave(text) {
  const t0 = now();
  const url = `https://api.search.brave.com/res/v1/web/search?count=5&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { 'X-Subscription-Token': process.env.BRAVE_API_KEY, Accept: 'application/json' } });
  const body = await res.json();
  if (!res.ok) throw new Error(`brave ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  const snippets = (body.web?.results ?? []).slice(0, 4).map((r) => `${r.title}: ${r.description}`);
  return { ms: now() - t0, snippets };
}

async function write(text, snippets) {
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

const fmt = (ms) => `${Math.round(ms)}`.padStart(5);
const rows = [];
for (let run = 0; run < RUNS; run++) {
  for (const text of lines) {
    const t0 = now();
    // Search starts together with the decision; its result is used only if Jev says yes.
    const [d, pf, br] = await Promise.all([jev(text), parallel(text, 'fast').catch((e) => ({ ms: NaN, snippets: [], error: e.message })), brave(text).catch((e) => ({ ms: NaN, snippets: [], error: e.message }))]);
    let w = null;
    if (d.p >= 0.5) w = await write(text, pf.snippets.length ? pf.snippets : br.snippets);
    const total = now() - t0;
    rows.push({ run, text, d, pf, br, w, total });
    await new Promise((r) => setTimeout(r, 1100));
    console.log(`jev ${fmt(d.ms)} p=${d.p?.toFixed(2)} | parallel ${fmt(pf.ms)} | brave ${fmt(br.ms)} | writer ${w ? fmt(w.ms) : '    -'} | total ${fmt(total)} ms | ${text.slice(0, 42)}${w ? `\n      → ${w.line}` : ''}${pf.error ? `\n      parallel error: ${pf.error}` : ''}${br.error ? `\n      brave error: ${br.error}` : ''}`);
  }
}
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const lookups = rows.filter((r) => r.w);
console.log(`\nmedian ms: jev ${fmt(median(rows.map((r) => r.d.ms)))} | parallel fast ${fmt(median(rows.map((r) => r.pf.ms)))} | brave ${fmt(median(rows.map((r) => r.br.ms)))} | writer ${fmt(median(lookups.map((r) => r.w.ms)))} | total with fact ${fmt(median(lookups.map((r) => r.total)))}`);
