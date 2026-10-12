// Measures decide → search → write latency for live conversation facts.
import { now, jev, parallel, brave, write } from './steps.mjs';

const lines = [
  'Oye, ¿sabías que Cerebras acaba de sacar el CS-4?',
  'Ayer almorcé con mi mamá y estuvo rico.',
  '¿Cuántos habitantes tiene Guayaquil más o menos?',
  'Dicen que la Independencia de Guayaquil fue en 1820.',
  'Jajaja sí, qué locura, bueno sigamos.',
  'El otro día leí que OpenAI lanzó gpt-realtime-translate.',
];
const RUNS = Number(process.env.RUNS ?? 2);
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
