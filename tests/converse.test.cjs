const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

const load = loader({ encodeURIComponent, Promise, Error }, {});
const { lookupFact, parseFactLine } = load('app/apps/converse/converse-facts.ts');
const KEYS = { typesafe: '', cerebras: '', openRouter: 'or-key', perplexity: 'px-key', brave: 'br-key' };

function fakePost(routes) {
  const calls = [];
  const post = async (url, headers, body) => {
    calls.push({ url, body: body && JSON.parse(body) });
    const route = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!route) throw new Error(`unexpected ${url}`);
    return routes[route](JSON.parse(body ?? 'null'));
  };
  return { post, calls };
}

const PERPLEXITY = { status: 200, json: { results: [{ title: 'Chimborazo', url: 'https://es.wikipedia.org/wiki/Chimborazo', snippet: '6263 m' }] } };
const writer = (content) => ({ status: 200, json: { choices: [{ message: { content } }] } });

test('a sentence worth a fact becomes topic, source host and one line', async () => {
  const { post, calls } = fakePost({
    'https://openrouter.ai/api/alpha/decisions': () => ({ status: 200, json: { answers: { lookup: { noul: 0.93 } } } }),
    'https://api.perplexity.ai/search': () => PERPLEXITY,
    'https://openrouter.ai/api/v1/chat/completions': () => writer('Chimborazo | El Chimborazo mide 6.263 m sobre el nivel del mar. | 1'),
  });
  const fact = await lookupFact('¿Qué altura tiene el Chimborazo?', 'es', KEYS, post);
  assert.deepEqual({ ...fact }, { topic: 'Chimborazo', text: 'El Chimborazo mide 6.263 m sobre el nivel del mar.', source: 'es.wikipedia.org' });
  assert.deepEqual(calls.slice(0, 2).map((call) => call.url.split('/')[2]), ['api.perplexity.ai', 'openrouter.ai'], 'the search starts with the decision, not after it');
  assert.equal(calls[0].body.search_type, 'fast');
  assert.match(calls[2].body.messages[0].content, /in Spanish/);
});

test('small talk gets no fact and no writer call', async () => {
  const { post, calls } = fakePost({
    'https://openrouter.ai/api/alpha/decisions': () => ({ status: 200, json: { answers: { lookup: { noul: 0.04 } } } }),
    'https://api.perplexity.ai/search': () => PERPLEXITY,
  });
  assert.equal(await lookupFact('Ayer almorcé con mi mamá y estuvo rico.', 'es', KEYS, post), null);
  assert.ok(!calls.some((call) => call.url.includes('chat/completions')));
  assert.equal(await lookupFact('Sí, claro', 'es', KEYS, post), null, 'too short to look up');
});

test('Brave answers when Perplexity fails', async () => {
  const { post } = fakePost({
    'https://openrouter.ai/api/alpha/decisions': () => ({ status: 200, json: { answers: { lookup: { noul: 0.9 } } } }),
    'https://api.perplexity.ai/search': () => ({ status: 401, json: {} }),
    'https://api.search.brave.com/': () => ({ status: 200, json: { web: { results: [{ title: 'Anthropic', url: 'https://www.anthropic.com/company', description: 'CEO Dario Amodei' }] } } }),
    'https://openrouter.ai/api/v1/chat/completions': () => writer('Anthropic | Dario Amodei is the CEO of Anthropic. | 1'),
  });
  const fact = await lookupFact('Who is the CEO of Anthropic these days?', 'en', KEYS, post);
  assert.equal(fact.source, 'anthropic.com');
});

test('the writer saying nothing relevant shows nothing', () => {
  assert.equal(parseFactLine('-', ['https://a.com']), null);
  assert.equal(parseFactLine('Topic | - | 1', ['https://a.com']), null);
  assert.equal(parseFactLine('Topic | A fact. | 9', ['https://a.com/x']).source, 'a.com');
});

function recordingFace() {
  const draws = [];
  return { draws, lineHeight: 20, measureLine: (text) => Array.from(text).length * 10, drawText: (_image, x, y, text, value = 255) => draws.push({ x, y, text, value }) };
}

test('the screen is the fact under its topic, nothing else', () => {
  const painter = loader({}, { '../paseo/paseo-painter': { CONTENT_TOP: 20, FOOTER_TOP: 250, LEFT: 20, PITCH: 27, RIGHT: 556,
    fitLine: (_face, text) => text, wrapLines: (_face, text) => [text], wrapCapped: (_face, text) => [text] } })('app/apps/converse/converse-painter.ts');
  const face = recordingFace();
  const previous = { topic: 'Cajas', source: 'x.com', text: 'Está a media hora de Cuenca.' };
  painter.paintConverse({}, face, { fact: { topic: 'Chimborazo', source: 'es.wikipedia.org', text: 'Mide 6.263 m.' }, previous, status: { label: '', bright: false }, message: null });
  assert.deepEqual(face.draws.map((d) => [d.text, d.value]), [['Chimborazo', 153], ['Mide 6.263 m.', 255], ['Cajas', 70], ['Está a media hora de Cuenca.', 120]]);
  assert.ok(face.draws[2].y > face.draws[1].y, 'the previous fact sits under the newest');
  face.draws.length = 0;
  painter.paintConverse({}, face, { fact: null, previous: null, status: { label: '· Live facts', bright: false }, message: null });
  assert.deepEqual(face.draws.map((d) => [d.text, d.value]), [['· Live facts', 85]]);
});

function sessionHarness() {
  const lookups = [];
  let options = null;
  const setting = (value) => ({ get: () => value });
  const { ConverseSession } = loader({ Date, Promise }, {
    '../../native/reconnecting-stt': { ReconnectingSttClient: class { constructor(_create, opts) { options = opts; } start() {} stop() {} acceptPcm() {} } },
    '../../native/soniox-stt': { SonioxSttClient: class {} },
    '../../native/voice-control': { voiceControlBridge: { onRawPcm: () => () => {}, startRawCapture: () => true, stopRawCapture() {} } },
    '../../ui/dashboard-settings': { sonioxApiKeySetting: setting('sx'), typesafeApiKeySetting: setting('ts'), cerebrasApiKeySetting: setting(''), openRouterApiKeySetting: setting('or'), perplexityApiKeySetting: setting('px'), braveApiKeySetting: setting('') },
    '../../ui/shell/voice-activity': { voiceActivity: { subscribe: () => () => {} } },
    '../evenhub/mic-router': { activeCommunicator: () => ({}) },
    '../translate/translate-session': { describeFailure: (message) => message },
  })('app/apps/converse/converse-session.ts');
  const session = new ConverseSession(() => {}, (sentence, language, _keys, context) => new Promise((resolve) => lookups.push({ sentence, language, context, resolve })));
  session.start();
  options.onStatus('Listening (Soniox)...');
  const say = (text, language) => {
    options.onTokens([{ text, is_final: true, language }]);
    options.onTranscript({ text, isFinal: true, paragraphBreakAfter: true });
  };
  return { session, lookups, say, options };
}

test('a slow lookup never replaces the fact of a later sentence', async () => {
  const { session, lookups, say } = sessionHarness();
  assert.equal(session.state.kind, 'listening');
  say('¿Cuántos habitantes tiene Guayaquil?', 'es');
  say('Who is the CEO of Anthropic?', 'en');
  assert.deepEqual(lookups.map((l) => l.language), ['es', 'en']);
  lookups[1].resolve({ topic: 'Anthropic', source: 'anthropic.com', text: 'Dario Amodei.' });
  await new Promise((r) => setImmediate(r));
  lookups[0].resolve({ topic: 'Guayaquil', source: 'inec.gob.ec', text: '3 millones.' });
  await new Promise((r) => setImmediate(r));
  assert.equal(session.fact.topic, 'Anthropic');
  assert.equal(session.previous, null, 'a stale lookup does not become the previous fact either');
});

test('interim transcripts are not looked up', () => {
  const { lookups, options } = sessionHarness();
  options.onTranscript({ text: '¿Cuántos habi', isFinal: false });
  assert.equal(lookups.length, 0);
});

test('Jev and Cerebras are called directly when their keys are set, OpenRouter answers when Cerebras fails', async () => {
  const { post, calls } = fakePost({
    'https://api.typesafe.ai/v1/systemone': () => ({ status: 200, json: { answers: { lookup: { noul: 0.95 } } } }),
    'https://api.perplexity.ai/search': () => PERPLEXITY,
    'https://api.cerebras.ai/': () => ({ status: 402, json: {} }),
    'https://openrouter.ai/api/v1/chat/completions': () => writer('Chimborazo | Mide 6.263 m. | 1'),
  });
  const fact = await lookupFact('¿Qué altura tiene el Chimborazo?', 'es', { ...KEYS, typesafe: 'ts-key', cerebras: 'cb-key' }, post);
  assert.equal(fact.text, 'Mide 6.263 m.');
  const typesafe = calls.find((call) => call.url.includes('typesafe'));
  assert.equal(typesafe.body.state, 'Latest utterance: ¿Qué altura tiene el Chimborazo?');
  assert.ok(!calls.some((call) => call.url.includes('alpha/decisions')));
});

test('Converse says which key is still missing', () => {
  const { missingConverseKey } = loader({}, { '../../ui/dashboard-settings': {} })('app/apps/converse/converse-keys.ts');
  const none = { typesafe: '', cerebras: '', openRouter: '', perplexity: '', brave: '' };
  assert.equal(missingConverseKey('', none), 'Soniox');
  assert.equal(missingConverseKey('sx', none), 'Jev (TypeSafe)');
  assert.equal(missingConverseKey('sx', { ...none, typesafe: 'ts' }), 'Cerebras');
  assert.equal(missingConverseKey('sx', { ...none, openRouter: 'or' }), 'Perplexity');
  assert.equal(missingConverseKey('sx', { ...none, typesafe: 'ts', cerebras: 'cb', brave: 'br' }), null);
});

test('a follow-up sentence is searched with the one before it and written with the conversation', async () => {
  const { post, calls } = fakePost({
    'https://api.typesafe.ai/v1/systemone': () => ({ status: 200, json: { answers: { lookup: { noul: 0.9 } } } }),
    'https://api.perplexity.ai/search': () => PERPLEXITY,
    'https://api.cerebras.ai/': () => writer('Cuenca | Cuenca tiene unos 330 000 habitantes. | 1'),
  });
  const context = { earlier: ['El mes pasado fui a Cuenca con mi familia.'], shown: ['La catedral se terminó en 1975.'], region: 'EC' };
  const fact = await lookupFact('¿Sabes cuántos habitantes tiene?', 'es', { ...KEYS, typesafe: 'ts', cerebras: 'cb' }, post, context);
  assert.equal(fact.topic, 'Cuenca');
  const queries = calls.filter((call) => call.url.includes('perplexity')).map((call) => call.body);
  assert.deepEqual(queries.map((q) => q.query), ['¿Sabes cuántos habitantes tiene?', 'El mes pasado fui a Cuenca con mi familia. ¿Sabes cuántos habitantes tiene?']);
  assert.equal(queries[0].country, 'EC');
  assert.match(calls.find((call) => call.url.includes('typesafe')).body.state, /Earlier: El mes pasado fui a Cuenca/);
  const prompt = calls.find((call) => call.url.includes('cerebras')).body.messages.map((m) => m.content).join('\n');
  assert.match(prompt, /Earlier conversation:\nEl mes pasado fui a Cuenca/);
  assert.match(prompt, /Already shown:\nLa catedral se terminó en 1975\./);
});

test('a fact line missing its topic still shows the fact', () => {
  const fact = parseFactLine('Anthropic acusa a tres empresas de extraer datos de Claude | 1', ['https://donporque.com/x']);
  assert.deepEqual({ ...fact }, { topic: '', text: 'Anthropic acusa a tres empresas de extraer datos de Claude', source: 'donporque.com' });
  assert.equal(parseFactLine('Muy largo tema que en realidad es todo el dato completo sin separar | 1', ['https://a.com']).topic, '');
});

test('each sentence carries what was said before it, and leaving starts a new conversation', () => {
  const { session, lookups, say } = sessionHarness();
  say('El mes pasado fui a Cuenca.', 'es');
  say('¿Cuántos habitantes tiene?', 'es');
  assert.deepEqual(Array.from(lookups[1].context.earlier), ['El mes pasado fui a Cuenca.']);
  session.stop();
  assert.equal(session.transcript.length, 0);
});

test('a new fact moves the one it replaces to previous', async () => {
  const { session, lookups, say } = sessionHarness();
  say('¿Qué altura tiene el Chimborazo?', 'es');
  lookups[0].resolve({ topic: 'Chimborazo', source: '', text: 'Mide 6.263 m.' });
  await new Promise((r) => setImmediate(r));
  say('¿Y el Cotopaxi qué tan alto es?', 'es');
  lookups[1].resolve({ topic: 'Cotopaxi', source: '', text: 'Mide 5.897 m.' });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([session.fact.topic, session.previous.topic], ['Cotopaxi', 'Chimborazo']);
});
