const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

const load = loader({ encodeURIComponent, Promise, Error, setTimeout, clearTimeout, JSON, Date }, {});
const { raceChat, chatTargets } = load('app/assistant/instant/instant-llm.ts');
const { InstantChat, KEPT_TURNS, IDLE_NEW_TOPIC_MS } = load('app/assistant/instant/instant-chat.ts');
const { matchShortcut } = load('app/assistant/instant/instant-shortcuts.ts');
const { instantTools, confirmation, toModelName, fromModelName } = load('app/assistant/instant/instant-tools.ts');
const { runTurn, promptMessages, plainAnswer } = load('app/assistant/instant/instant-turn.ts');

const plain = (value) => JSON.parse(JSON.stringify(value));
const content = (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`;
const toolCall = (name, args) => `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name, arguments: JSON.stringify(args) } }] } }] })}`;
const stop = (reason) => `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}`;

/** Each URL plays its script: lines after `delayMs`, or an HTTP error. */
function fakeOpener(scripts) {
  const opened = [];
  const open = (url, body, headers, listener) => {
    const script = typeof scripts === 'function' ? scripts(url, JSON.parse(body)) : scripts[url];
    const entry = { url, body: JSON.parse(body), cancelled: false };
    opened.push(entry);
    setTimeout(() => {
      if (entry.cancelled) return;
      if (script.error) return listener.onHttpError(script.error, '');
      for (const line of script.lines) { if (entry.cancelled) return; listener.onLine(line); }
      if (!entry.cancelled) listener.onComplete();
    }, script.delayMs ?? 0);
    return { cancel() { entry.cancelled = true; } };
  };
  return { open, opened };
}

const CEREBRAS = 'https://api.cerebras.ai/v1/chat/completions';
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const TARGETS = chatTargets({ cerebras: 'cb', openRouter: 'or' });

function race(open, request = { messages: [{ role: 'user', content: 'hola' }] }) {
  return new Promise((resolve, reject) => raceChat(open, TARGETS, request, { onDone: resolve, onError: (m) => reject(new Error(m)) }));
}

test('both providers start at once and the first to stream wins; the other is cancelled', async () => {
  const { open, opened } = fakeOpener({
    [CEREBRAS]: { delayMs: 40, lines: [content('lento'), stop('stop')] },
    [OPENROUTER]: { delayMs: 5, lines: [content('Canberra.'), stop('stop')] },
  });
  const result = await race(open);
  assert.equal(result.text, 'Canberra.');
  assert.equal(result.winner, 'groq');
  assert.equal(opened.length, 2);
  assert.equal(opened[1].body.provider.order[0], 'groq');
  assert.ok(opened[0].cancelled, 'the slower provider is cancelled');
});

test('a provider that fails drops out of the race', async () => {
  const { open } = fakeOpener({
    [CEREBRAS]: { error: 503 },
    [OPENROUTER]: { delayMs: 10, lines: [content('Hola.'), stop('stop')] },
  });
  assert.equal((await race(open)).text, 'Hola.');
  const { open: bothFail } = fakeOpener({ [CEREBRAS]: { error: 503 }, [OPENROUTER]: { error: 429 } });
  await assert.rejects(race(bothFail), /HTTP/);
});

test('tool calls stream in pieces and come back whole', async () => {
  const { open } = fakeOpener({
    [CEREBRAS]: { lines: [toolCall('timer__set', { minutes: 5 }), stop('tool_calls')] },
    [OPENROUTER]: { delayMs: 50, lines: [content('x'), stop('stop')] },
  });
  const result = await race(open);
  assert.equal(result.toolCalls[0].function.name, 'timer__set');
  assert.deepEqual(JSON.parse(result.toolCalls[0].function.arguments), { minutes: 5 });
});

test('without a Cerebras key both targets go through OpenRouter', () => {
  assert.deepEqual([...chatTargets({ cerebras: '', openRouter: 'or' })].map((t) => t.name), ['groq', 'openrouter-cerebras']);
  assert.deepEqual([...chatTargets({ cerebras: 'cb', openRouter: '' })].map((t) => t.name), ['cerebras']);
});

test('shortcuts catch exact commands in Spanish and English', () => {
  assert.deepEqual(plain(matchShortcut('Pon un timer de cinco minutos.')), { kind: 'tool', tool: 'timer.set', args: { minutes: 5 } });
  assert.deepEqual(plain(matchShortcut('set a timer for 10 seconds')), { kind: 'tool', tool: 'timer.set', args: { seconds: 10 } });
  assert.deepEqual(plain(matchShortcut('¿Qué hora es?')), { kind: 'time' });
  assert.equal(matchShortcut('Siguiente canción').tool, 'media.next');
  assert.equal(matchShortcut('Pausa la música').tool, 'media.play_pause');
  assert.equal(matchShortcut('¿Qué pasa con el timer de la pasta?'), null);
  assert.equal(matchShortcut('¿Quién ganó el partido?'), null);
});

function memoryStore(initial = '') {
  let value = initial;
  return { read: () => value, write: (v) => { value = v; }, get value() { return value; } };
}

test('the chat keeps recent turns, starts a new topic after idling and compacts older turns', async () => {
  const store = memoryStore();
  const chat = new InstantChat(store);
  const t = 1_000_000;
  for (let i = 0; i < KEPT_TURNS + 2; i++) chat.add({ question: `q${i}`, answer: `a${i}`, atMs: t + i });
  assert.equal(chat.turnsForPrompt(t + 10).length, KEPT_TURNS);
  assert.equal(chat.turnsForPrompt(t + IDLE_NEW_TOPIC_MS + 100).length, 0, 'a new topic after half an hour');
  assert.equal(chat.needsCompaction(), false, 'two older turns are not worth a call yet');
  for (let i = 0; i < KEPT_TURNS; i++) chat.add({ question: `p${i}`, answer: `b${i}`, atMs: t + 20 + i });
  assert.equal(chat.needsCompaction(), true);
  let seen = '';
  await chat.compact(async (previous, transcript) => { seen = transcript; return 'Habló de q0 a q7.'; });
  assert.match(seen, /User: q0\nInstant: a0/);
  assert.equal(chat.summary, 'Habló de q0 a q7.');
  assert.equal(chat.turns.length, KEPT_TURNS);
  chat.remember('Vive en Los Ceibos.');
  chat.remember('Vive en Los Ceibos.');
  const reloaded = new InstantChat(memoryStore(store.value));
  assert.deepEqual([...reloaded.notes], ['Vive en Los Ceibos.']);
  assert.equal(reloaded.summary, 'Habló de q0 a q7.');
});

test('the prompt keeps the fixed prefix first and the context only on the new question', () => {
  const chat = new InstantChat(memoryStore());
  chat.remember('Vive en Los Ceibos.');
  chat.add({ question: '¿Capital de Perú?', answer: 'Lima.', atMs: 1000 });
  const messages = promptMessages(chat, 2000, 'Now: Sunday 2026-10-11 21:00', '¿Y de Chile?');
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /Los Ceibos/);
  assert.deepEqual(Array.from(messages.slice(1, 3), (m) => m.content), ['¿Capital de Perú?', 'Lima.']);
  assert.match(messages[3].content, /^\[Context\]\nNow: Sunday[\s\S]*\[Question\]\n¿Y de Chile\?$/);
});

test('answers lose markdown and links', () => {
  assert.equal(plainAnswer('**Sí**, en [Cinnabon](https://x.y) del Riocentro.'), 'Sí, en Cinnabon del Riocentro.');
});

test('registry tools travel with model-safe names and only the allowed ones', () => {
  const specs = ['timer.set', 'apps.move_to_folder', 'calendar.list_events'].map((name) => ({ name, description: name, inputSchema: { type: 'object' } }));
  const names = instantTools(specs).map((t) => t.function.name);
  assert.ok(names.includes('timer__set'));
  assert.ok(!names.includes('apps__move_to_folder'));
  assert.ok(!names.includes('calendar__list_events'), 'the calendar is read through the context, not a tool');
  assert.equal(fromModelName(toModelName('nav.start_navigation')), 'nav.start_navigation');
  assert.equal(confirmation('timer.set', { hours: 1, minutes: 30 }, 'es'), 'Listo, timer de 1 hora y 30 minutos.');
});

function turnDeps(open, overrides = {}) {
  const calls = [];
  const posts = [];
  const chat = new InstantChat(memoryStore());
  return {
    calls, posts, chat,
    deps: {
      open, targets: TARGETS, tools: [], chat,
      searchKeys: { perplexity: 'px', brave: '' }, region: 'EC',
      post: async (url, headers, body) => { posts.push({ url, body: JSON.parse(body) }); return { status: 200, json: { results: [{ title: 'F1', url: 'https://f1.com', snippet: 'Verstappen ganó en Singapur.', date: '2026-10-11' }] } }; },
      callTool: async (name, args) => { calls.push({ name, args }); return { ok: true, content: 'ok' }; },
      askGrokBot: async () => null,
      clock: () => '21:05',
      now: () => Date.now(),
      ...overrides,
    },
  };
}

test('a timer command runs on the phone with no model call', async () => {
  const { open, opened } = fakeOpener({});
  const { deps, calls } = turnDeps(open);
  const outcome = await runTurn({ question: 'Pon un timer de 5 minutos', language: 'es', context: Promise.resolve('') }, deps, () => {}, () => {}).result;
  assert.equal(outcome.answer, 'Listo, timer de 5 minutos.');
  assert.equal(outcome.route, 'shortcut');
  assert.equal(opened.length, 0);
  assert.deepEqual(plain(calls[0]), { name: 'timer.set', args: { minutes: 5 } });
});

test('a web question uses the search that started beside the model', async () => {
  let round = 0;
  const { open } = fakeOpener((url, body) => {
    if (url !== CEREBRAS) return { error: 500 };
    round++;
    if (body.messages.some((m) => m.role === 'tool')) return { lines: [content('Verstappen ganó en Singapur.'), stop('stop')] };
    return { lines: [toolCall('web_search', { query: 'último GP F1' }), stop('tool_calls')] };
  });
  const { deps, posts } = turnDeps(open);
  const outcome = await runTurn({ question: '¿Quién ganó la última carrera de F1?', language: 'es', context: Promise.resolve('Now: Sunday') }, deps, () => {}, () => {}).result;
  assert.equal(outcome.answer, 'Verstappen ganó en Singapur.');
  assert.equal(outcome.route, 'search');
  assert.equal(posts.length, 1, 'the speculative search is reused, not repeated');
  assert.equal(posts[0].body.query, '¿Quién ganó la última carrera de F1?');
  assert.equal(round, 2);
});

test('a successful action is confirmed without a second model call', async () => {
  let rounds = 0;
  const { open } = fakeOpener((url) => {
    if (url !== CEREBRAS) return { error: 500 };
    rounds++;
    return { lines: [toolCall('roam__add_todo', { text: 'comprar canela' }), stop('tool_calls')] };
  });
  const { deps, calls } = turnDeps(open);
  const outcome = await runTurn({ question: 'Anota comprar canela', language: 'es', context: Promise.resolve('') }, deps, () => {}, () => {}).result;
  assert.equal(outcome.answer, 'Anotado.');
  assert.equal(rounds, 1);
  assert.deepEqual(plain(calls[0]), { name: 'roam.add_todo', args: { text: 'comprar canela' } });
});

test('complex tasks go to Grok Bot', async () => {
  const { open } = fakeOpener((url) => (url === CEREBRAS ? { lines: [toolCall('ask_grok_bot', { task: 'Reserva el vuelo más barato a Quito' }), stop('tool_calls')] } : { error: 500 }));
  const sent = [];
  const { deps } = turnDeps(open, { askGrokBot: async (task) => { sent.push(task); return null; } });
  const outcome = await runTurn({ question: 'Resérvame el vuelo más barato a Quito', language: 'es', context: Promise.resolve('') }, deps, () => {}, () => {}).result;
  assert.equal(outcome.route, 'grok-bot');
  assert.equal(sent[0], 'Reserva el vuelo más barato a Quito');
  assert.match(outcome.answer, /Grok Bot/);
});
