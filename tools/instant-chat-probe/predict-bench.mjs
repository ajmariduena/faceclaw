// How often can Instant guess the next question before it is asked? Replays real turns
// (TURNS=path to [{q, a, skip}] exported from a chat), predicts K next questions after each
// answer, then a stricter judge call decides whether a prepared answer would have fit.
// CEREBRAS_API_KEY. K (default 5), CONTEXT turns (default 6).
import { readFileSync, writeFileSync } from 'node:fs';

const K = Number(process.env.K ?? 5);
const CONTEXT = Number(process.env.CONTEXT ?? 6);
const turns = JSON.parse(readFileSync(process.env.TURNS, 'utf8')).filter((t) => !t.skip);

async function cerebras(messages, effort, maxTokens = 600) {
  const t0 = performance.now();
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-oss-120b', reasoning_effort: effort, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return { ms: performance.now() - t0, data: JSON.parse(json.choices[0].message.content) };
}

const transcript = (ts) => ts.map((t) => `User: ${t.q}\nAssistant: ${t.a}`).join('\n\n');

function predict(history) {
  return cerebras([
    { role: 'system', content: `You predict what a user will ask a voice assistant on smart glasses next. Write the ${K} most likely next questions, most likely first, in the user's language and voice. Each must be a different question that can be answered on its own. Reply as JSON: {"questions": [...]}.` },
    { role: 'user', content: transcript(history) },
  ], 'low');
}

function judge(history, actual, predicted) {
  return cerebras([
    { role: 'system', content: 'You grade predictions of a user\'s next question. An answer was prepared in advance for each predicted question. A prediction is a hit only if its prepared answer would fully and correctly answer the actual question, with nothing important missing. Same topic is not enough. Also say whether the actual question follows up on the conversation or starts a new topic. Reply as JSON: {"hit": <1-based index of the first hit, or 0>, "followUp": true|false, "why": "<short>"}' },
    { role: 'user', content: `Conversation so far:\n${transcript(history.slice(-2))}\n\nPredicted questions:\n${predicted.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nActual next question: ${actual}` },
  ], 'medium', 3000);
}

const rows = [];
for (let i = 1; i < turns.length; i++) {
  const history = turns.slice(Math.max(0, i - CONTEXT), i);
  const p = await predict(history);
  const predicted = (p.data.questions ?? []).slice(0, K);
  const j = await judge(history, turns[i].q, predicted);
  rows.push({ actual: turns[i].q, predicted, hit: j.data.hit, followUp: j.data.followUp, why: j.data.why, predictMs: Math.round(p.ms) });
  console.log(`${j.data.hit ? `HIT@${j.data.hit}` : 'miss '} ${j.data.followUp ? 'follow' : 'new   '} ${Math.round(p.ms)}ms | ${turns[i].q.slice(0, 70)}${j.data.hit ? `  ⇐ ${predicted[j.data.hit - 1].slice(0, 60)}` : ''}`);
}

const at = (k, rs) => rs.filter((r) => r.hit && r.hit <= k).length;
const follow = rows.filter((r) => r.followUp);
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const summary = { questions: rows.length, followUps: follow.length, hit1: at(1, rows), hit3: at(3, rows), hit5: at(5, rows), followHit3: at(3, follow), followHit5: at(5, follow), predictMs50: median(rows.map((r) => r.predictMs)) };
console.log(JSON.stringify(summary));
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ summary, rows }, null, 1));
