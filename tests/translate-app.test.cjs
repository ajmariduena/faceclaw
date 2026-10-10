const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/soniox-translate-two-way.json');
const { loader } = require('./helpers/load-typescript.cjs');
const { translateHarness } = require('./helpers/translate-harness.cjs');

const graphics = loader({ Date, Uint32Array, Int32Array, DataView, ArrayBuffer }, {
  '../native/settings-store': { getStringSetting: (_key, fallback) => fallback },
  '../native/frame-timings': { spanCurrent: (_name, fn) => fn() },
  '../native/texture-atlas': { textureAtlasAvailable: () => false },
})('app/graphics/image.ts');

function recordingFace() {
  const draws = [];
  return {
    draws,
    lineHeight: 20,
    measureLine: (text) => Array.from(text).length * 10,
    drawText: (_image, x, y, text, value = 255) => draws.push({ x, y, text, value }),
  };
}

function open(options = {}) {
  const face = recordingFace();
  const app = translateHarness({ graphics, face, ...options });
  const paint = () => { face.draws.length = 0; app.paint(); return [...face.draws]; };
  return { ...app, face, paint };
}

test('opens straight into a two-way ES/EN Soniox translation fed by the glasses mic', () => {
  const app = open();
  assert.equal(app.sockets.length, 1);
  const config = app.socket().config;
  assert.equal(JSON.stringify(config.translation), JSON.stringify({ type: 'two_way', language_a: 'es', language_b: 'en' }));
  assert.equal(config.apiKey, 'soniox-test-key');
  assert.equal(app.mic.starts, 1);
  assert.ok(app.window().isVoiceCapturing(), '"Hey Even" is ignored and the screen stays on');
  assert.ok(app.paint().some((d) => d.text === '· Connecting'));
  app.socket().open();
  app.pcm(new Uint8Array([1, 2, 3, 4]));
  assert.equal(app.socket().pcm.length, 1, 'mic audio reaches Soniox once it is ready');
  for (const message of fixture.slice(0, 3)) app.socket().send(message.tokens);
  app.advance(42_000);
  const draws = app.paint();
  assert.ok(draws.some((d) => d.text === 'Hello, how are you?' && d.value === 255));
  assert.ok(draws.some((d) => d.text === 'Hola, ¿cómo estás?' && d.value === 120));
  assert.ok(draws.some((d) => d.text === '· Translating' && d.value === 119));
  assert.ok(draws.some((d) => d.text === '0:42'));
  assert.ok(draws.some((d) => d.text === 'ES ') && draws.some((d) => d.text === ' EN'));
});

test('tap pauses (ending the Soniox session, mic released) and resumes into a new session', () => {
  const app = open();
  app.socket().open();
  app.socket().send(fixture[1].tokens);
  app.advance(5_000);
  app.input('click');
  const first = app.socket();
  assert.equal(first.finished, true, 'paused session finalizes what was said');
  assert.equal(app.mic.stops, 1);
  assert.equal(app.window().isVoiceCapturing(), false);
  first.send([{ text: ' ¿qué tal?', is_final: true, language: 'es', translation_status: 'original' }]);
  app.advance(10_000);
  let draws = app.paint();
  assert.ok(draws.some((d) => d.text === '· Paused' && d.value === 255), 'paused footer stands out');
  assert.ok(draws.some((d) => d.text === '0:05'), 'paused time does not count');
  assert.ok(draws.some((d) => d.text.includes('¿qué tal?')), 'late finals from the paused session still land');
  app.input('click');
  assert.equal(app.sockets.length, 2);
  assert.equal(first.stopped, true);
  assert.equal(app.mic.starts, 2);
  app.socket().open();
  draws = app.paint();
  assert.ok(draws.some((d) => d.text === '· Translating'));
});

test('double tap while listening asks "Stop and leave?"; double tap or Keep listening stays', async () => {
  const app = open();
  app.socket().open();
  for (const message of fixture.slice(0, 3)) app.socket().send(message.tokens);
  await app.input('double-click');
  let draws = app.paint();
  assert.ok(draws.some((d) => d.text === 'Stop and leave?' && d.value === 255));
  assert.ok(draws.some((d) => d.text === 'Keep listening' && d.value === 255));
  assert.ok(draws.some((d) => d.text === '>' && d.y === draws.find((e) => e.text === 'Keep listening').y));
  assert.ok(draws.some((d) => d.text === 'Stop and leave' && d.value === 136));
  assert.equal(app.yields.length, 0);
  await app.input('double-click');
  assert.ok(!app.paint().some((d) => d.text === 'Stop and leave?'), 'double tap in the dialog keeps listening');
  assert.ok(app.window().isVoiceCapturing());
  await app.input('double-click');
  await app.input('click');
  assert.ok(app.window().isVoiceCapturing(), 'Keep listening');
  assert.equal(app.yields.length, 0);
  await app.input('double-click');
  await app.input('scroll-down');
  draws = app.paint();
  assert.ok(draws.some((d) => d.text === 'Stop and leave' && d.value === 255));
  await app.input('click');
  assert.equal(app.yields.length, 1, 'leaves through the root back gesture');
  assert.equal(app.window().isVoiceCapturing(), false);
  assert.equal(app.socket().stopped, true);
});

test('leaving while paused needs no confirmation; coming back starts again', async () => {
  const app = open();
  app.socket().open();
  app.input('click');
  await app.input('double-click');
  assert.equal(app.yields.length, 1);
  app.window().onForegroundChanged(false);
  app.window().onForegroundChanged(true);
  assert.equal(app.sockets.length, 2);
  assert.ok(app.window().isVoiceCapturing());
  app.window().setScreenOn(false);
  assert.equal(app.window().isVoiceCapturing(), false, 'screen off pauses');
  app.window().onForegroundChanged(true);
  app.window().onForegroundChanged(false);
  assert.equal(app.window().isVoiceCapturing(), false, 'background pauses');
  app.window().onClosed();
  assert.equal(app.closed(), 1);
});

test('three minutes without speech pause the translation', () => {
  const app = open();
  app.socket().open();
  app.advance(170_000);
  app.socket().send(fixture[0].tokens);
  app.advance(170_000);
  assert.ok(app.window().isVoiceCapturing(), 'speech restarted the silence clock');
  app.socket().send([{ text: 'Hel', is_final: false, language: 'en', source_language: 'es', translation_status: 'translation' }]);
  app.advance(11_000);
  assert.equal(app.window().isVoiceCapturing(), false, 'translations are not speech');
  assert.ok(app.paint().some((d) => d.text === '· Paused'));
});

test('no key, no glasses, busy mic and a rejected key say so in the frame; tap retries', () => {
  const missing = open({ apiKey: '  ' });
  assert.equal(missing.sockets.length, 0);
  assert.equal(missing.mic.starts, 0);
  let draws = missing.paint();
  assert.ok(draws.some((d) => d.text === 'Soniox key missing' && d.value === 255));
  assert.ok(!draws.some((d) => /tap|hold/i.test(d.text)), 'no gesture hints');
  missing.settings.apiKey = 'now-set';
  missing.input('click');
  assert.equal(missing.sockets.length, 1);

  const noGlasses = open({ communicator: null });
  assert.ok(noGlasses.paint().some((d) => d.text === 'Glasses not connected'));

  const busy = open({ micFree: false });
  assert.equal(busy.sockets.length, 0);
  assert.equal(busy.mic.listeners.size, 0);
  assert.ok(busy.paint().some((d) => d.text === 'Microphone in use'));

  const rejected = open();
  rejected.socket().config.onError('Soniox: Invalid API key. (401)');
  draws = rejected.paint();
  assert.ok(draws.some((d) => d.text === 'Translation stopped'));
  assert.ok(draws.some((d) => d.text === 'The Soniox key was rejected.'));
  assert.equal(rejected.mic.stops, 1);
});

test('the mic is re-requested after the assistant releases it', () => {
  const app = open();
  app.socket().open();
  app.voiceActivity.setActive(true);
  app.voiceActivity.setActive(false);
  assert.equal(app.mic.starts, 2);
  app.input('click');
  app.voiceActivity.setActive(true);
  app.voiceActivity.setActive(false);
  assert.equal(app.mic.starts, 2, 'not while paused');
});

test('a dropped connection reconnects and starts a new segment', () => {
  const app = open();
  app.socket().open();
  app.socket().send(fixture[1].tokens);
  app.socket().config.onDisconnected('Soniox connection closed.');
  assert.ok(app.paint().some((d) => d.text === '· Reconnecting'));
  app.advance(1_000);
  assert.equal(app.sockets.length, 2);
  app.socket().open();
  app.socket().send([{ text: 'Sí', is_final: true, language: 'es', translation_status: 'original' }]);
  const draws = app.paint();
  assert.ok(draws.some((d) => d.text === '· Translating'));
  assert.ok(draws.some((d) => d.text === 'Hola,') && draws.some((d) => d.text === 'Sí'));
});
