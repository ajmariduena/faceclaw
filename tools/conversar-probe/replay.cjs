// Usage: node tools/conversar-probe/replay.cjs <faceclaw-converse-*.jsonl>  (needs OPENROUTER_API_KEY, PERPLEXITY_API_KEY, BRAVE_API_KEY)
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const repo = join(__dirname, '..', '..');
const { loader } = require(join(repo, 'tests/helpers/load-typescript.cjs'));
process.chdir(repo);
const { lookupFact } = loader({ encodeURIComponent, Promise, Error, setTimeout, clearTimeout }, {})('app/apps/converse/converse-facts.ts');

const post = async (url, headers, body, timeoutMs) => {
  const response = await fetch(url, { method: body === null ? 'GET' : 'POST', headers, body: body ?? undefined, signal: AbortSignal.timeout(timeoutMs + 3000) });
  return { status: response.status, json: await response.json().catch(() => null) };
};
const keys = { typesafe: '', cerebras: '', openRouter: process.env.OPENROUTER_API_KEY, perplexity: process.env.PERPLEXITY_API_KEY ?? '', brave: process.env.BRAVE_API_KEY ?? '' };
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((line) => JSON.parse(line));

(async () => {
  const earlier = [];
  const shown = [];
  for (const row of rows) {
    const started = Date.now();
    const fact = await lookupFact(row.said, row.language ?? 'es', keys, post, { earlier: [...earlier], shown: [...shown], region: process.env.REGION ?? 'EC' }).catch(() => null);
    earlier.push(row.said);
    if (fact) {
      shown.push(fact.text);
      if (shown.length > 10) shown.shift();
    }
    console.log(JSON.stringify({ said: row.said, before: row.fact?.text ?? null, now: fact ? `${fact.topic} | ${fact.text}` : null, ms: Date.now() - started }));
  }
})();
