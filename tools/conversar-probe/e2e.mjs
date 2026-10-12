// Measures end of speech → fact line: a synthetic ES/EN conversation streamed to Soniox
// in real time, then decide → search → write on every finished sentence.
// Needs SONIOX_KEY_FILE plus the keys in steps.mjs; macOS `say` and ffmpeg build the audio.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { now, jev, parallel, brave, write, perplexityFast } from './steps.mjs';

const RATE = 16000;
const GAP_MS = Number(process.env.GAP_MS ?? 1500);
const CHUNK_MS = 100;
const turns = [
  ['Eddy (Spanish (Mexico))', 'Oye, ¿sabías que Cerebras acaba de sacar el CS-4?'],
  ['Flo (Spanish (Mexico))', 'Ayer almorcé con mi mamá y estuvo rico.'],
  ['Eddy (Spanish (Mexico))', '¿Cuántos habitantes tiene Guayaquil más o menos?'],
  ['Ava (Premium)', 'I think the Golden Gate Bridge opened in 1937, right?'],
  ['Flo (Spanish (Mexico))', 'Jajaja sí, qué locura, bueno sigamos.'],
  ['Ava (Premium)', 'Who is the CEO of Anthropic these days?'],
  ['Eddy (Spanish (Mexico))', 'Dicen que la Independencia de Guayaquil fue en 1820.'],
  ['Flo (Spanish (Mexico))', 'Bueno, ya me tengo que ir, hablamos luego.'],
];

const dir = mkdtempSync(join(tmpdir(), 'conversar-'));
const parts = [];
const speechEnds = [];
let offset = 0;
for (const [i, [voice, text]] of turns.entries()) {
  const aiff = join(dir, `${i}.aiff`);
  execFileSync('say', ['-v', voice, '-o', aiff, text]);
  // Trailing silence is trimmed so the recorded end of speech is the last voiced sample.
  const pcm = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', aiff, '-af', 'areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse', '-ar', `${RATE}`, '-ac', '1', '-f', 's16le', '-']);
  parts.push(pcm);
  offset += (pcm.length / 2 / RATE) * 1000;
  speechEnds.push(offset);
  const gap = Buffer.alloc(Math.round((GAP_MS / 1000) * RATE) * 2);
  parts.push(gap);
  offset += GAP_MS;
}
const audio = Buffer.concat(parts);

const ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket');
const results = turns.map(([, text]) => ({ text }));
const pipelines = [];
let t0 = 0;
let finalText = '';
let next = 0;
let lastFinalAt = 0;

function utteranceFor(at) {
  // The sentence whose speech ended last before this moment.
  let k = -1;
  for (let i = 0; i < speechEnds.length; i++) if (t0 + speechEnds[i] <= at) k = i;
  return Math.max(k, next);
}

async function lookup(r, text, heardAt) {
  const search = process.env.SEARCH === 'parallel' ? parallel(text, 'fast') : perplexityFast(text);
  const [d, pf, br] = await Promise.all([jev(text), search.catch((e) => ({ ms: NaN, snippets: [], error: e.message })), brave(text).catch((e) => ({ ms: NaN, snippets: [], error: e.message }))]);
  r.jev = d.p;
  if (d.p >= 0.5) {
    const w = await write(text, pf.snippets.length ? pf.snippets : br.snippets);
    r.line = w.line;
    r.cardMs = now() - r.speechEndAt;
  }
  r.pipelineMs = now() - heardAt;
  r.parallelMs = pf.ms;
  r.braveMs = br.ms;
}

ws.onopen = async () => {
  ws.send(JSON.stringify({
    api_key: readFileSync(process.env.SONIOX_KEY_FILE, 'utf8').trim(),
    model: 'stt-rt-v5',
    audio_format: 'pcm_s16le',
    sample_rate: RATE,
    num_channels: 1,
    enable_speaker_diarization: true,
    language_hints: ['es', 'en'],
    enable_language_identification: true,
    enable_endpoint_detection: true,
  }));
  t0 = now();
  const step = (RATE * 2 * CHUNK_MS) / 1000;
  for (let i = 0, k = 0; i < audio.length; i += step, k++) {
    const wait = t0 + k * CHUNK_MS - now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    ws.send(audio.subarray(i, i + step));
  }
  ws.send(JSON.stringify({ type: 'finalize' }));
  ws.send('');
};

ws.onmessage = (event) => {
  const at = now();
  const msg = JSON.parse(event.data);
  if (msg.error_code) { console.error(`soniox ${msg.error_code}: ${msg.error_message}`); process.exit(1); }
  for (const token of msg.tokens ?? []) {
    if (!token.is_final) continue;
    if (token.text === '<end>' || token.text === '<fin>') {
      const text = finalText.trim();
      finalText = '';
      if (!text || next >= results.length) continue;
      const i = utteranceFor(lastFinalAt);
      const r = results[i];
      r.heard = text;
      r.speechEndAt = t0 + speechEnds[i];
      r.lastWordMs = lastFinalAt - r.speechEndAt;
      r.endpointMs = at - r.speechEndAt;
      next = i + 1;
      pipelines.push(lookup(r, text, at));
      continue;
    }
    finalText += token.text;
    lastFinalAt = at;
  }
  if (msg.finished) ws.close();
};

ws.onclose = async () => {
  await Promise.all(pipelines);
  const fmt = (ms) => (Number.isFinite(ms) ? `${Math.round(ms)}` : '-').padStart(5);
  for (const r of results) {
    console.log(`final word ${fmt(r.lastWordMs)} | <end> ${fmt(r.endpointMs)} | pipeline ${fmt(r.pipelineMs)} | card ${fmt(r.cardMs)} ms | p=${r.jev?.toFixed(2) ?? '-'} | ${r.text}`);
    if (r.heard && r.heard !== r.text) console.log(`      heard: ${r.heard}`);
    if (r.line) console.log(`      → ${r.line}`);
  }
  const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  console.log(`\nmedian ms after speech ends: final word ${fmt(median(results.map((r) => r.lastWordMs)))} | <end> ${fmt(median(results.map((r) => r.endpointMs)))} | card ${fmt(median(results.map((r) => r.cardMs)))} | parallel ${fmt(median(results.map((r) => r.parallelMs)))} | brave ${fmt(median(results.map((r) => r.braveMs)))}`);
};
