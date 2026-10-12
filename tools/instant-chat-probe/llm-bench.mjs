// Streaming latency of candidate models for Instant: time to first token, first sentence and full answer.
// Keys: CEREBRAS_API_KEY (direct) and OPENROUTER_API_KEY. RUNS (default 8) per candidate, after one cold call.
const RUNS = Number(process.env.RUNS ?? 8);
const ONLY = process.env.ONLY;

const SYSTEM = [
  'You are Instant, a voice assistant shown on smart glasses.',
  'Answer in the language of the question. Plain text, no markdown, no lists.',
  'Answer first, in one or two short sentences of at most 100 characters each.',
  `Today is ${new Date().toISOString().slice(0, 10)}. The user is in Guayaquil, Ecuador.`,
].join('\n');

const HISTORY = [
  { role: 'user', content: '¿Qué tal el clima para salir a correr en la mañana?' },
  { role: 'assistant', content: 'Temprano, antes de las 8, hace unos 23 grados y poca humedad.' },
];

const QUESTIONS = [
  '¿Cuál es la capital de Australia?',
  '¿Cuántos gramos tiene una libra?',
  'What is the boiling point of water in Fahrenheit?',
  '¿Quién escribió Cien años de soledad?',
  'Dame una idea rápida para la cena.',
  '¿Cuánto es 15 por ciento de 80?',
  'How do you say thank you in Japanese?',
  '¿Qué significa la palabra efímero?',
  '¿Cuál es el planeta más grande del sistema solar?',
  'Explícame en una frase qué es un agujero negro.',
];

const CANDIDATES = [
  { id: 'cerebras:gpt-oss-120b', url: 'https://api.cerebras.ai/v1/chat/completions', key: 'CEREBRAS_API_KEY', body: { model: 'gpt-oss-120b', reasoning_effort: 'low' } },
  { id: 'cerebras:qwen-3.8-27b', url: 'https://api.cerebras.ai/v1/chat/completions', key: 'CEREBRAS_API_KEY', body: { model: 'qwen-3.8-27b', reasoning_effort: 'none' } },
  ...[
    ['or/cerebras:gpt-oss-120b', 'openai/gpt-oss-120b', 'cerebras', { reasoning: { effort: 'low' } }],
    ['or/groq:gpt-oss-120b', 'openai/gpt-oss-120b', 'groq', { reasoning: { effort: 'low' } }],
    ['or/groq:llama-3.1-8b', 'meta-llama/llama-3.1-8b-instruct', 'groq', {}],
    ['or/groq:gpt-oss-safeguard-20b', 'openai/gpt-oss-safeguard-20b', 'groq', { reasoning: { effort: 'low' } }],
    ['or/inception:mercury-2.5', 'inception/mercury-2.5', 'inception', { reasoning: { effort: 'none' } }],
    ['or/mistral:ministral-3b', 'mistralai/ministral-3b-2512', 'mistral', {}],
    ['or/coreweave:nemotron-3.5-lightning', 'nvidia/nemotron-3.5-lightning', 'coreweave', { reasoning: { enabled: false } }],
  ].map(([id, model, provider, extra]) => ({
    id,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: 'OPENROUTER_API_KEY',
    body: { model, provider: { order: [provider], allow_fallbacks: false }, ...extra },
  })),
];

async function once(c, question) {
  const t0 = performance.now();
  const res = await fetch(c.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env[c.key]}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...c.body,
      stream: true,
      max_tokens: 300,
      messages: [{ role: 'system', content: SYSTEM }, ...HISTORY, { role: 'user', content: question }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  const decoder = new TextDecoder();
  let buf = '', text = '', first = NaN, sentence = NaN;
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
      let delta;
      try { delta = JSON.parse(line.slice(5)).choices?.[0]?.delta?.content; } catch { continue; }
      if (!delta) continue;
      const t = performance.now() - t0;
      if (Number.isNaN(first)) first = t;
      text += delta;
      if (Number.isNaN(sentence) && /[.!?](\s|$)/.test(text.slice(8))) sentence = t;
    }
  }
  const total = performance.now() - t0;
  return { first, sentence: Number.isNaN(sentence) ? total : sentence, total, text: text.trim() };
}

const pct = (xs, p) => {
  const s = xs.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]) : NaN;
};

const out = [];
for (const c of CANDIDATES) {
  if (ONLY && !c.id.includes(ONLY)) continue;
  if (!process.env[c.key]) { console.log(`${c.id}: skipped, no ${c.key}`); continue; }
  const runs = [];
  let cold = NaN, err = '';
  for (let i = 0; i <= RUNS; i++) {
    try {
      const r = await once(c, QUESTIONS[i % QUESTIONS.length]);
      if (i === 0) cold = r.first; else runs.push(r);
    } catch (e) { err = e.message; }
  }
  const row = {
    id: c.id,
    cold: Math.round(cold),
    ttft50: pct(runs.map((r) => r.first), 50),
    ttft90: pct(runs.map((r) => r.first), 90),
    sentence50: pct(runs.map((r) => r.sentence), 50),
    total50: pct(runs.map((r) => r.total), 50),
    ok: runs.length,
    sample: runs[0]?.text.slice(0, 80) ?? '',
    err,
  };
  out.push(row);
  console.log(JSON.stringify(row));
}
if (process.env.OUT) (await import('node:fs')).writeFileSync(process.env.OUT, JSON.stringify(out, null, 2));
