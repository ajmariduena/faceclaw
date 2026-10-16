// Tail latency of one request versus hedged requests (first token wins, the loser is aborted).
// CEREBRAS_API_KEY and OPENROUTER_API_KEY; ROUNDS (default 20).
const ROUNDS = Number(process.env.ROUNDS ?? 20);
const SYSTEM = 'You are Instant, a voice assistant on smart glasses. Answer in the language of the question, one short plain sentence.';
const QUESTIONS = ['¿Capital de Australia?', '¿Cuántos gramos tiene una libra?', 'Boiling point of water in Fahrenheit?', '¿Quién escribió Cien años de soledad?', '¿Cuánto es 15% de 80?'];

const cerebras = (model, extra) => ({ url: 'https://api.cerebras.ai/v1/chat/completions', key: process.env.CEREBRAS_API_KEY, body: { model, ...extra } });
const openrouter = (model, provider, extra) => ({ url: 'https://openrouter.ai/api/v1/chat/completions', key: process.env.OPENROUTER_API_KEY, body: { model, provider: { order: [provider], allow_fallbacks: false }, ...extra } });
const GPT = cerebras('gpt-oss-120b', { reasoning_effort: 'low' });
const QWEN = cerebras('qwen-3.8-27b', { reasoning_effort: 'none' });
const GROQ = openrouter('openai/gpt-oss-120b', 'groq', { reasoning: { effort: 'low' } });

async function firstToken(t, q, signal) {
  const t0 = performance.now();
  const res = await fetch(t.url, {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${t.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...t.body, stream: true, max_tokens: 120, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: q }] }),
  });
  if (!res.ok) throw new Error(String(res.status));
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    if (/"content":"[^"]/.test(buf)) return performance.now() - t0;
  }
  throw new Error('no content');
}

async function hedged(targets, q) {
  const controllers = targets.map(() => new AbortController());
  const ms = await Promise.any(targets.map((t, i) => firstToken(t, q, controllers[i].signal)));
  controllers.forEach((c) => c.abort());
  return ms;
}

const STRATEGIES = {
  'cerebras gpt-oss': [GPT],
  'cerebras qwen': [QWEN],
  'gpt-oss x2 (cerebras)': [GPT, GPT],
  'cerebras gpt-oss + qwen': [GPT, QWEN],
  'cerebras + groq gpt-oss': [GPT, GROQ],
};
const samples = Object.fromEntries(Object.keys(STRATEGIES).map((k) => [k, []]));
for (const t of [GPT, QWEN, GROQ]) await firstToken(t, 'hola').catch(() => {});
for (let r = 0; r < ROUNDS; r++) {
  for (const [name, targets] of Object.entries(STRATEGIES)) {
    try { samples[name].push(await hedged(targets, QUESTIONS[r % QUESTIONS.length])); } catch { samples[name].push(NaN); }
  }
}
const pct = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]); };
for (const [name, xs] of Object.entries(samples)) console.log(JSON.stringify({ name, p50: pct(xs, 50), p90: pct(xs, 90), max: pct(xs, 100), ok: xs.filter(Number.isFinite).length }));
