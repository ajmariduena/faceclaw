const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

// Objects built inside the loader's vm realm fail deepStrictEqual on prototype identity.
const eq = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);
const load = loader();
const api = load('app/assistant/grokbot/grokbot-api.ts');
const hubModule = load('app/assistant/grokbot/grokbot-hub.ts');
const model = load('app/apps/bots/bots-model.ts');
const { GrokBotHub, KEY_REJECTED, OFFLINE, FAST_POLL_MS, SLOW_POLL_MS, FOLLOW_UP_MS, parseBotNames } = hubModule;

const NOW = new Date(2026, 9, 10, 9, 41).getTime();
const idle = { idle: true, inFlight: false, queued: 0 };
const busy = { idle: false, inFlight: true, queued: 0 };
const user = (seq, text) => ({ seq, updatedSeq: seq, kind: 'message', role: 'user', text, createdAtMs: NOW - 1000 });
const bot = (seq, text) => ({ seq, updatedSeq: seq, kind: 'send-message', text, createdAtMs: NOW });

function server() {
  const calls = [], pages = [];
  const state = { status: 200, offline: false, createdAtMs: NOW - 86_400_000, delivery: 'accepted_temporal', cursor: 0 };
  const reply = body => ({ status: 200, text: async () => JSON.stringify(body) });
  const fetch = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: url.replace('https://api.cursor.com', ''), method: init.method, headers: init.headers, body });
    if (state.offline) throw new Error('Unable to resolve host');
    if (state.status !== 200) return { status: state.status, text: async () => '{"error":"Invalid User API Key"}' };
    const path = calls.at(-1).url;
    if (path === '/v0/grokbot/sessions') return reply({ id: `s-${body.name}`, name: body.name, createdAtMs: state.createdAtMs, latestUpdatedSeq: 0 });
    if (path.endsWith('/messages')) return reply({ messageId: body.messageId, delivery: state.delivery });
    if (path.endsWith('/interrupt')) return reply({ interrupted: true });
    if (path.includes('/entries?')) {
      const page = pages.shift() ?? { entries: [], turn: idle };
      for (const entry of page.entries) state.cursor = Math.max(state.cursor, entry.updatedSeq);
      return reply({ latestUpdatedSeq: state.cursor, ...page });
    }
    return { status: 404, text: async () => '' };
  };
  return { fetch, calls, pages, state };
}

function harness({ key = 'cursor-key', names = 'Glasses, Research', cache = '' } = {}) {
  const s = server();
  const timers = [], logs = [], replies = [];
  let now = NOW, stored = cache, apiKey = key, botNames = names, uuids = 0;
  const hub = new GrokBotHub({
    fetch: s.fetch, apiKey: () => apiKey, botNames: () => parseBotNames(botNames),
    loadCache: () => stored, saveCache: value => { stored = value; },
    now: () => now, uuid: () => `uuid-${++uuids}`, log: message => logs.push(message),
    setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
    clearTimeout: timer => { const index = timers.indexOf(timer); if (index >= 0) timers.splice(index, 1); },
  });
  hub.onReply(name => replies.push(name));
  return { hub, ...s, timers, logs, replies, cache: () => stored,
    advance: ms => { now += ms; }, setKey: value => { apiKey = value; }, setNames: value => { botNames = value; },
    nextDelay: () => timers.at(-1)?.ms ?? null, entriesCalls: () => s.calls.filter(call => call.url.includes('/entries?')) };
}

test('API client: bearer key, the four routes, delivery check and typed failures', async () => {
  const s = server();
  const client = new api.GrokBotApi(s.fetch, () => ' key-1 ');
  const session = await client.session('Glasses');
  assert.equal(session.id, 's-Glasses');
  eq(s.calls[0], { url: '/v0/grokbot/sessions', method: 'POST', headers: { Authorization: 'Bearer key-1', 'Content-Type': 'application/json' }, body: { name: 'Glasses' } });
  await client.send('s-Glasses', 'hola', 'm-1');
  eq(s.calls[1].body, { text: 'hola', messageId: 'm-1' });
  s.state.delivery = 'duplicate';
  await client.send('s-Glasses', 'hola', 'm-1');
  s.state.delivery = 'rejected';
  await assert.rejects(client.send('s-Glasses', 'hola', 'm-2'), error => error.status === -1 && /Not delivered/.test(error.message));
  s.pages.push({ entries: [user(1, 'hola')], turn: busy });
  const page = await client.entries('s-Glasses', -1);
  assert.equal(s.calls.at(-1).url, '/v0/grokbot/sessions/s-Glasses/entries?afterUpdatedSeq=-1');
  assert.equal(s.calls.at(-1).headers['Content-Type'], undefined);
  eq(page.turn, busy);
  assert.equal(page.latestUpdatedSeq, 1);
  await client.interrupt('s-Glasses', 'why');
  eq(s.calls.at(-1).body, { reason: 'why' });
  s.state.status = 401;
  await assert.rejects(client.entries('s-Glasses', 1), error => error.rejectedKey && error.status === 401);
  s.state.status = 200; s.state.offline = true;
  await assert.rejects(client.session('Glasses'), error => error.status === 0 && !error.rejectedKey);
  assert.match(api.uuidv4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('bot names: comma-separated, trimmed, deduplicated, Glasses by default', () => {
  eq(parseBotNames(' Glasses , Research,,glasses, Inbox '), ['Glasses', 'Research', 'Inbox']);
  eq(parseBotNames(' , '), ['Glasses']);
});

test('start loads each bot\'s history once, caches its session and polls slowly while nobody watches', async () => {
  const h = harness();
  h.pages.push({ entries: [user(1, '¿Qué hora es?'), bot(2, 'Son las 9:41.'), { seq: 3, updatedSeq: 3, kind: 'approval', createdAtMs: NOW }], turn: idle });
  h.pages.push({ entries: [{ seq: 1, updatedSeq: 1, kind: 'approval', createdAtMs: NOW }], turn: idle });
  h.hub.start();
  await new Promise(setImmediate);
  const glasses = h.hub.bot('Glasses');
  eq(glasses.messages.map(m => [m.role, m.text]), [['user', '¿Qué hora es?'], ['bot', 'Son las 9:41.']]);
  assert.equal(glasses.unread, 0, 'history before the first load is read');
  assert.equal(glasses.newEmpty, false);
  eq(h.entriesCalls().map(call => call.url), ['/v0/grokbot/sessions/s-Glasses/entries?afterUpdatedSeq=-1', '/v0/grokbot/sessions/s-Research/entries?afterUpdatedSeq=-1']);
  eq(h.logs, ['grokbot: ignoring entry kind "approval"'], 'unknown kinds are logged once');
  eq(JSON.parse(h.cache()), { Glasses: { id: 's-Glasses', readSeq: 2 }, Research: { id: 's-Research', readSeq: 0 } });
  assert.equal(h.nextDelay(), SLOW_POLL_MS);
  h.hub.setWatching(['Glasses']);
  await new Promise(setImmediate);
  assert.equal(h.entriesCalls().at(-1).url, '/v0/grokbot/sessions/s-Glasses/entries?afterUpdatedSeq=3');
  assert.equal(h.nextDelay(), FAST_POLL_MS);
  h.hub.setWatching([]);
  assert.equal(h.nextDelay(), SLOW_POLL_MS);
  const restarted = harness({ cache: h.cache() });
  restarted.hub.start();
  await new Promise(setImmediate);
  assert.equal(restarted.calls.filter(call => call.url === '/v0/grokbot/sessions').length, 0, 'cached sessions are reused');
});

test('a sent message shows at once, the ack and result arrive while working, and an empty idle page settles the turn', async () => {
  const h = harness({ names: 'Glasses' });
  h.hub.start();
  await new Promise(setImmediate);
  const sending = h.hub.send('Glasses', 'Clima de mañana');
  const glasses = h.hub.bot('Glasses');
  eq(glasses.messages.map(m => [m.text, Boolean(m.pending)]), [['Clima de mañana', true]]);
  assert.equal(await sending, '');
  eq(h.calls.find(call => call.url.endsWith('/messages')).body, { text: 'Clima de mañana', messageId: 'uuid-1' });
  assert.equal(glasses.working, true);
  assert.equal(h.nextDelay(), FAST_POLL_MS);
  h.pages.push({ entries: [user(1, 'Clima de mañana'), bot(2, 'Ya reviso el pronóstico…')], turn: busy });
  await h.hub.refresh();
  eq(glasses.messages.map(m => [m.role, m.text, Boolean(m.pending)]), [['user', 'Clima de mañana', false], ['bot', 'Ya reviso el pronóstico…', false]]);
  eq(h.replies, ['Glasses'], 'the ack is a reply to the user\'s turn');
  assert.equal(glasses.unread, 1);
  h.hub.setViewing('Glasses');
  assert.equal(glasses.unread, 0);
  h.pages.push({ entries: [bot(3, 'Mañana 24°, sin lluvia.')], turn: busy });
  await h.hub.refresh();
  eq(h.replies, ['Glasses'], 'no reply event while that chat is on screen');
  assert.equal(glasses.unread, 0);
  assert.equal(glasses.working, true);
  h.advance(12_000);
  assert.equal(model.workingLabel(NOW + 12_000 - glasses.workingSince), 'working 0:12');
  await h.hub.refresh();
  assert.equal(glasses.working, false, 'idle and empty after being busy');
  assert.equal(h.nextDelay(), FAST_POLL_MS, 'still fast: the bot often follows up');
  h.hub.setViewing(null);
  h.advance(40_000);
  h.pages.push({ entries: [bot(4, 'Listo: LATAM, USD 68.')], turn: idle });
  await h.hub.refresh();
  eq(h.replies, ['Glasses', 'Glasses'], 'a follow-up after the turn settled still buzzes');
  h.advance(FOLLOW_UP_MS);
  await h.hub.refresh();
  assert.equal(h.nextDelay(), SLOW_POLL_MS, 'slow once the follow-up window ends');
});

test('a turn never seen busy needs four idle empty pages; a reply counts as having run', async () => {
  const h = harness({ names: 'Glasses' });
  h.hub.start();
  await new Promise(setImmediate);
  await h.hub.send('Glasses', 'hola');
  const glasses = h.hub.bot('Glasses');
  h.pages.push({ entries: [user(1, 'hola')], turn: idle });
  await h.hub.refresh();
  for (let poll = 1; poll < 4; poll++) { await h.hub.refresh(); assert.equal(glasses.working, true, `poll ${poll}`); }
  await h.hub.refresh();
  assert.equal(glasses.working, false);
  await h.hub.send('Glasses', '¿y mañana?');
  h.pages.push({ entries: [user(2, '¿y mañana?'), bot(3, 'Igual.')], turn: idle });
  await h.hub.refresh();
  assert.equal(glasses.working, true);
  await h.hub.refresh();
  assert.equal(glasses.working, false);
});

test('Stop interrupts the turn and leaves a Stopped line; a routine message marks unread without a reply event', async () => {
  const h = harness({ names: 'Glasses' });
  h.hub.start();
  await new Promise(setImmediate);
  await h.hub.send('Glasses', 'Busca vuelos');
  h.pages.push({ entries: [user(1, 'Busca vuelos'), bot(2, 'Ya estoy en eso.')], turn: busy });
  await h.hub.refresh();
  assert.equal(await h.hub.interrupt('Glasses'), true);
  eq(h.calls.at(-1), { url: '/v0/grokbot/sessions/s-Glasses/interrupt', method: 'POST',
    headers: { Authorization: 'Bearer cursor-key', 'Content-Type': 'application/json' }, body: { reason: 'Stopped from the glasses' } });
  const glasses = h.hub.bot('Glasses');
  assert.equal(glasses.working, false);
  eq(model.chatLines(glasses, '').at(-1), { role: 'assistant', text: '> Stopped', action: true });
  h.pages.push({ entries: [], turn: busy });
  h.hub.setWatching(['Glasses']);
  await new Promise(setImmediate);
  assert.equal(h.pages.length, 0);
  assert.equal(glasses.working, false, 'the interrupted turn winding down does not count as a new one');
  h.hub.setWatching([]);
  assert.equal(await h.hub.interrupt('Glasses'), false, 'nothing to stop');
  h.replies.length = 0;
  h.hub.markRead('Glasses');
  h.advance(60_000);
  h.pages.push({ entries: [bot(3, 'Brief: 3 urgentes.')], turn: idle });
  await h.hub.refresh();
  eq(h.replies, []);
  assert.equal(glasses.unread, 1);
  assert.equal(glasses.stopped, false, 'a later bot message replaces the Stopped line');
});

test('a rejected key stops polling until the key changes; network failures back off and recover', async () => {
  const h = harness({ names: 'Glasses' });
  h.state.status = 401;
  h.hub.start();
  await new Promise(setImmediate);
  assert.equal(h.hub.error, KEY_REJECTED);
  assert.equal(h.timers.length, 0, 'no polling with a rejected key');
  assert.equal(model.chatEmptyMessage(h.hub.bot('Glasses'), h.hub), 'Cursor key rejected · fix on phone');
  assert.equal(model.botsGlance(h.hub, NOW).status, KEY_REJECTED);
  assert.equal(await h.hub.send('Glasses', 'hola'), KEY_REJECTED);
  eq(h.hub.bot('Glasses').messages, [], 'the pending message is withdrawn');
  h.state.status = 200;
  h.setKey('cursor-key-2');
  h.hub.configChanged();
  await new Promise(setImmediate);
  assert.equal(h.hub.error, '');
  assert.equal(h.hub.bot('Glasses').loaded, true);
  h.hub.setWatching(['Glasses']);
  await new Promise(setImmediate);
  h.state.offline = true;
  await h.hub.refresh();
  assert.equal(h.hub.error, OFFLINE);
  assert.equal(model.chatEmptyMessage(h.hub.bot('Glasses'), h.hub), 'Ask Grok Bot anything', 'a loaded chat stays; the footer says Offline');
  assert.equal(h.nextDelay(), 3000);
  await h.hub.refresh();
  assert.equal(h.nextDelay(), 6000, 'watched backoff doubles');
  h.hub.setWatching([]);
  assert.equal(h.nextDelay(), SLOW_POLL_MS, 'background backoff never polls faster than the slow interval');
  h.state.offline = false;
  h.hub.setWatching(['Glasses']);
  await new Promise(setImmediate);
  assert.equal(h.hub.error, '');
  assert.equal(h.nextDelay(), FAST_POLL_MS);
  h.setKey('');
  h.hub.configChanged();
  assert.equal(h.timers.length, 0, 'no polling without a key');
  assert.equal(model.chatEmptyMessage(h.hub.bot('Glasses'), h.hub), 'Add a Cursor key on the phone');
  assert.equal(model.botsGlance(h.hub, NOW).status, 'Setup required');
});

test('a just-created session means the name matched no bot: "new empty bot" until it has messages', async () => {
  const h = harness({ names: 'Glases' });
  h.state.createdAtMs = NOW - 2000;
  h.hub.start();
  await new Promise(setImmediate);
  const typo = h.hub.bot('Glases');
  assert.equal(typo.newEmpty, true);
  assert.equal(model.chatEmptyMessage(typo, h.hub), 'New empty bot · name not found');
  assert.equal(JSON.parse(h.cache()).Glases.created, true);
  await h.hub.send('Glases', 'hola');
  assert.equal(typo.newEmpty, false);
});

test('the home card glance: unread first, then working, then the latest; empty and setup states', async () => {
  const h = harness({ names: 'Glasses, Research, Inbox' });
  h.hub.start();
  await new Promise(setImmediate);
  eq({ ...model.botsGlance(h.hub, NOW) }, { updates: [], status: 'Ask Grok Bot anything' });
  const [glasses, research, inbox] = h.hub.list();
  glasses.messages.push({ role: 'bot', text: 'Sale 06:20 desde GYE.', createdAtMs: NOW - 60 * 60_000, seq: 2 });
  research.messages.push({ role: 'user', text: 'Compara Google y Mapbox', createdAtMs: NOW - 5 * 60_000, seq: 4 });
  Object.assign(research, { working: true, workingSince: NOW - 4 * 60_000 });
  inbox.messages.push({ role: 'bot', text: '3 urgentes: Fly pide respuesta hoy.', createdAtMs: NOW - 2 * 60 * 60_000, seq: 9 });
  inbox.unread = 1;
  const glance = model.botsGlance(h.hub, NOW);
  eq(glance.updates.map(update => [update.who, update.line]), [
    ['2 h', '3 urgentes: Fly pide respuesta hoy.'],
    ['working 4 min', 'You: Compara Google y Mapbox'],
  ]);
  assert.equal(model.elapsedClock(12_000), '0:12');
  assert.equal(model.elapsedClock(16 * 60_000 + 5000), '16:05');
});

test('replies drop chat-app markdown: links keep their text, lists become dots, bare URLs their host', () => {
  assert.equal(model.plainText('Sí: [CNT Riocentro Ceibos](https://exa.ai/x/(y)), en **Riocentro**.'), 'Sí: CNT Riocentro Ceibos, en Riocentro.');
  assert.equal(model.plainText('Precios:\n\n- LATAM, USD 68.\n* Avianca\n2. Copa\n\n## Fin `ok`'), 'Precios:\n· LATAM, USD 68.\n· Avianca\n· Copa\nFin ok');
  assert.equal(model.plainText('Mira https://www.cnt.com.ec/paginas/agencias?x=1 hoy'), 'Mira cnt.com.ec hoy');
  assert.equal(model.plainText('Sale a las 5:20 a. m. - llega 6:12'), 'Sale a las 5:20 a. m. - llega 6:12');
});
