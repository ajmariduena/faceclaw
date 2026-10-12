// Soniox turn latency for Instant: ms from the last voiced sample of a spoken question to
// (a) the live transcript already holding the whole question and (b) the final <end>/<fin>.
// MODE=livefacts|aggressive|manual. SONIOX_API_KEY; macOS `say` and ffmpeg build the audio.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RATE = 16000;
const CHUNK_MS = 40;
const GAP_MS = 2500;
const MODE = process.env.MODE ?? 'aggressive';
const MANUAL_SILENCE_MS = Number(process.env.MANUAL_SILENCE_MS ?? 200);

const QUESTIONS = [
  ['Paulina', '¿Cuál es la capital de Australia?'],
  ['Eddy (Spanish (Mexico))', '¿Cuántos gramos tiene una libra?'],
  ['Samantha', 'What is the boiling point of water in Fahrenheit?'],
  ['Paulina', 'Pon un timer de cinco minutos.'],
  ['Eddy (Spanish (Mexico))', '¿Quién ganó el último Gran Premio de Fórmula uno?'],
  ['Samantha', 'How do you say thank you in Japanese?'],
  ['Paulina', '¿Qué tengo en el calendario mañana?'],
  ['Eddy (Spanish (Mexico))', 'Dame una idea rápida para la cena.'],
];

const CONFIGS = {
  livefacts: { enable_endpoint_detection: true, endpoint_sensitivity: -0.5, max_endpoint_delay_ms: 3000 },
  aggressive: { enable_endpoint_detection: true, endpoint_latency_adjustment_level: 3, endpoint_sensitivity: 0.5, max_endpoint_delay_ms: 600 },
  manual: {},
};

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const lastWord = (s) => norm(s).split(' ').pop();

const dir = mkdtempSync(join(tmpdir(), 'instant-stt-'));
const parts = [];
const speechEnds = [];
let offset = 0;
for (const [i, [voice, text]] of QUESTIONS.entries()) {
  const aiff = join(dir, `${i}.aiff`);
  execFileSync('say', ['-v', voice, '-o', aiff, text]);
  const pcm = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', aiff, '-af', 'areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse', '-ar', `${RATE}`, '-ac', '1', '-f', 's16le', '-']);
  parts.push(pcm);
  offset += (pcm.length / 2 / RATE) * 1000;
  speechEnds.push(offset);
  parts.push(Buffer.alloc(Math.round((GAP_MS / 1000) * RATE) * 2));
  offset += GAP_MS;
}
const audio = Buffer.concat(parts);

const ws = new WebSocket('wss://stt-rt.soniox.com/transcribe-websocket');
const results = QUESTIONS.map(([, text]) => ({ text, partialMs: NaN, endMs: NaN, heard: '' }));
let t0 = 0;
let cur = 0;
let finalText = '';

ws.onopen = async () => {
  ws.send(JSON.stringify({
    api_key: process.env.SONIOX_API_KEY,
    model: 'stt-rt-v5',
    audio_format: 'pcm_s16le',
    sample_rate: RATE,
    num_channels: 1,
    language_hints: ['es', 'en'],
    ...CONFIGS[MODE],
  }));
  t0 = performance.now();
  const step = (RATE * 2 * CHUNK_MS) / 1000;
  const finalizeAt = speechEnds.map((e) => e + MANUAL_SILENCE_MS);
  let f = 0;
  for (let i = 0, k = 0; i < audio.length; i += step, k++) {
    const wait = t0 + k * CHUNK_MS - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    ws.send(audio.subarray(i, i + step));
    if (MODE === 'manual' && f < finalizeAt.length && (k + 1) * CHUNK_MS >= finalizeAt[f]) {
      ws.send(JSON.stringify({ type: 'finalize' }));
      f++;
    }
  }
  ws.send('');
};

ws.onmessage = (event) => {
  const at = performance.now() - t0;
  const msg = JSON.parse(event.data);
  if (msg.error_code) { console.error(`soniox ${msg.error_code}: ${msg.error_message}`); process.exit(1); }
  let nonFinal = '';
  let ended = false;
  for (const token of msg.tokens ?? []) {
    if (token.text === '<end>' || token.text === '<fin>') { ended = true; continue; }
    if (token.is_final) finalText += token.text; else nonFinal += token.text;
  }
  const r = results[cur];
  if (!r) return;
  const live = norm(finalText + nonFinal);
  if (Number.isNaN(r.partialMs) && at >= speechEnds[cur] - 1500 && live.endsWith(lastWord(r.text))) r.partialMs = at - speechEnds[cur];
  if (ended && norm(finalText)) {
    r.endMs = at - speechEnds[cur];
    r.heard = finalText.trim();
    finalText = '';
    cur++;
  }
  if (msg.finished) ws.close();
};

ws.onclose = () => {
  const fmt = (ms) => (Number.isFinite(ms) ? `${Math.round(ms)}` : '-').padStart(5);
  for (const r of results) console.log(`partial ${fmt(r.partialMs)} | final ${fmt(r.endMs)} ms | ${r.heard || '(nothing)'}`);
  const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  console.log(JSON.stringify({ mode: MODE, partial50: Math.round(median(results.map((r) => r.partialMs))), final50: Math.round(median(results.map((r) => r.endMs))), finalMax: Math.round(Math.max(...results.map((r) => r.endMs).filter(Number.isFinite))) }));
};
