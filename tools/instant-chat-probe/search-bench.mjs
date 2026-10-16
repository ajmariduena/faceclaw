// Questions that need the web: sequential (model asks for web_search, then search, then answer)
// versus speculative (Perplexity Fast starts with the model; its results are used if the model asks).
// CEREBRAS_API_KEY, PERPLEXITY_API_KEY.
const SYSTEM = [
  'You are Instant, a voice assistant on smart glasses. Answer in the language of the question, one short plain sentence.',
  'Call web_search for anything recent, live or that you are unsure about.',
  `Today is ${new Date().toISOString().slice(0, 10)}. The user is in Guayaquil, Ecuador.`,
].join('\n');
const TOOLS = [{ type: 'function', function: { name: 'web_search', description: 'Search the web.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } }];
const QUESTIONS = [
  '¿Quién ganó el último Gran Premio de Fórmula 1?',
  '¿A cómo está el dólar en Colombia hoy?',
  'What is the latest iPhone model?',
  '¿Cómo quedó el Barcelona en su último partido?',
  '¿Qué temperatura hace ahora en Quito?',
  'Who won the most recent Nobel Prize in Literature?',
];

async function chat(messages, tools) {
  const t0 = performance.now();
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-oss-120b', reasoning_effort: 'low', max_tokens: 400, messages, ...(tools ? { tools } : {}) }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return { ms: performance.now() - t0, msg: json.choices[0].message };
}

async function search(query) {
  const t0 = performance.now();
  const res = await fetch('https://api.perplexity.ai/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, search_type: 'fast', max_results: 5, country: 'EC' }),
  });
  const json = await res.json();
  const text = (json.results ?? []).map((r) => `${r.title} (${r.date ?? ''}): ${(r.snippet ?? '').slice(0, 400)}`).join('\n');
  return { ms: performance.now() - t0, text };
}

async function answer(q, speculative) {
  const t0 = performance.now();
  const spec = speculative ? search(q) : null;
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: q }];
  const first = await chat(messages, TOOLS);
  const call = first.msg.tool_calls?.[0];
  if (!call) return { total: performance.now() - t0, decideMs: first.ms, searched: false, text: first.msg.content };
  const query = JSON.parse(call.function.arguments).query;
  const s = spec ? await spec : await search(query);
  const afterSearch = performance.now() - t0;
  const final = await chat([...messages, { role: 'assistant', content: null, tool_calls: [call] }, { role: 'tool', tool_call_id: call.id, content: s.text }]);
  return { total: performance.now() - t0, decideMs: first.ms, searchMs: s.ms, afterSearch, answerMs: final.ms, searched: true, query, text: final.msg.content };
}

await answer('hola', false).catch(() => {});
const rows = { sequential: [], speculative: [] };
for (const q of QUESTIONS) {
  for (const mode of ['sequential', 'speculative']) {
    const r = await answer(q, mode === 'speculative');
    rows[mode].push(r.total);
    console.log(`${mode.padEnd(11)} ${Math.round(r.total)} ms (decide ${Math.round(r.decideMs)}, search ${Math.round(r.searchMs ?? 0)}, answer ${Math.round(r.answerMs ?? 0)}) ${r.searched ? '' : '[no search] '}${q} → ${r.text?.slice(0, 90)}`);
  }
}
const median = (xs) => Math.round(xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]);
console.log(JSON.stringify({ sequential50: median(rows.sequential), speculative50: median(rows.speculative) }));
