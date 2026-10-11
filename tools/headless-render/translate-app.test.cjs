/**
 * Translate screens through the production app (app/apps/translate: window,
 * layers, session, painter) and the extracted stock font, with only the
 * Soniox socket, mic bridge and clock stubbed. Writes out/translate-app-*.png:
 * live, paused, the leave dialog, connecting, a long monologue, scrolled
 * back, speech outside the pair, the missing key and a rejected key.
 *
 *   node --test tools/headless-render/translate-app.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { translateHarness } = require('../../tests/helpers/translate-harness.cjs');

const context = createRenderContext();
const { graphics } = context;
const facePromise = stockFont(graphics);
const outDir = path.join(__dirname, 'out');

function save(band, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
}

function tracing(face) {
  const draws = [];
  return {
    draws,
    face: {
      lineHeight: face.lineHeight,
      measureLine: (text) => face.measureLine(text),
      drawText: (image, x, y, text, value = 255) => {
        assert.ok(x >= 0 && x + face.measureLine(text) <= 576, `overflow: ${text}`);
        assert.ok(y >= 0 && y + face.lineHeight <= 288, `outside: ${text}`);
        draws.push({ x, y, text, value });
        face.drawText(image, x, y, text, value);
      },
    },
  };
}

async function open(options = {}) {
  const traced = tracing(await facePromise);
  const app = translateHarness({ graphics, face: traced.face, ...options });
  return {
    ...app,
    shot: (name) => {
      traced.draws.length = 0;
      const image = app.paint();
      save(image, name);
      const draws = [...traced.draws];
      assert.ok(draws.filter((d) => d.y < 244).every((d) => d.y + 27 <= 244), `${name}: content stays above the footer rule`);
      assert.ok(!draws.some((d) => /\btap\b|\bhold\b|press/i.test(d.text)), `${name}: no gesture hints`);
      return { image, draws };
    },
  };
}

const original = (text, language) => text.split(/(?= )/).map((piece) => ({ text: piece, is_final: true, language, translation_status: 'original' }));
const translation = (text, language, source) => text.split(/(?= )/).map((piece) => ({ text: piece, is_final: true, language, source_language: source, translation_status: 'translation' }));
const live = (tokens) => tokens.map((token) => ({ ...token, is_final: false }));
const END = { text: '<end>', is_final: true };

function converse(socket) {
  socket.send([...original('Hi! Do you know where the train station is?', 'en'), ...translation('¡Hola! ¿Sabes dónde está la estación de tren?', 'es', 'en'), END]);
  socket.send([...original('Sí, está a dos cuadras, al lado del mercado.', 'es'), ...translation("Yes, it's two blocks away, next to the market.", 'en', 'es'), END]);
  socket.send([...original('Great, and is it open on', 'en'), ...live(original(' Sundays?', 'en')), ...translation('Genial, ¿y abre los', 'es', 'en'), ...live(translation(' domingos?', 'es', 'en'))]);
}

test('live: only the utterance being translated, white with its gray tail; no frame, footer or history', async () => {
  const app = await open();
  app.socket().open();
  converse(app.socket());
  app.advance(42_000);
  const { image, draws } = app.shot('translate-app-live');
  assert.deepEqual(draws.map((d) => [d.text, d.value]), [['Genial, ¿y abre los', 255], [' domingos?', 187]]);
  assert.equal(draws[0].x, 22);
  assert.equal(draws[0].y + 27, 236, 'sits on the content bottom');
  let ink = 0;
  for (let y = 0; y < 288; y++) for (let x = 0; x < 576; x++) if (image.getPixel(x, y) && y < draws[0].y) ink++;
  assert.equal(ink, 0, 'nothing drawn above the translation');
});

test('paused, connecting and the leave dialog', async () => {
  const app = await open();
  const connecting = app.shot('translate-app-connecting');
  assert.ok(connecting.draws.some((d) => d.text === '· Connecting' && d.value === 120));
  app.socket().open();
  converse(app.socket());
  app.advance(42_000);
  await app.input('double-click');
  const leave = app.shot('translate-app-leave');
  assert.ok(leave.draws.some((d) => d.text === 'Genial, ¿y abre los domingos?' && d.value === 120 && d.y === 14), 'context above the box, dim');
  const question = leave.draws.find((d) => d.text === 'Stop and leave?');
  assert.ok(question && question.x === 28);
  assert.ok(leave.draws.some((d) => d.text === 'Keep listening' && d.value === 255 && d.x === 48));
  assert.ok(leave.draws.some((d) => d.text === 'Stop and leave' && d.value === 136));
  await app.input('double-click');
  app.input('click');
  app.advance(3_000);
  const paused = app.shot('translate-app-paused');
  const label = paused.draws.find((d) => d.text === '· Paused');
  assert.ok(label && label.value === 255, '"· Paused" in white');
  assert.ok(paused.draws.some((d) => d.text.startsWith('Genial, ¿y abre los') && d.value === 255), 'the paused session keeps what was translated');
});

test('a long monologue keeps its newest lines; scrolling back shows earlier exchanges', async () => {
  const app = await open();
  app.socket().open();
  converse(app.socket());
  app.socket().send([END]);
  const speech = 'Mira, la estación queda cerca, pero los domingos el horario cambia: abren a las ocho y el último tren sale a las nueve de la noche, así que si vas a viajar tarde te conviene comprar el boleto antes y llegar con tiempo porque siempre hay fila en la boletería.';
  app.socket().send([...original(speech, 'es'), ...translation("Look, the station is close, but on Sundays the schedule changes: they open at eight and the last train leaves at nine at night, so if you're traveling late you should buy the ticket beforehand and arrive early because there's always a line at the ticket office.", 'en', 'es')]);
  app.advance(75_000);
  const long = app.shot('translate-app-long');
  assert.equal(long.draws.length, 3, 'three lines at most');
  assert.ok(long.draws.every((d) => d.value === 255));
  assert.ok(long.draws[0].text.startsWith('…'));
  assert.ok(long.draws.at(-1).text.endsWith('ticket office.'));
  app.input('scroll-up');
  app.input('scroll-up');
  const back = app.shot('translate-app-scrolled');
  assert.ok(back.draws.some((d) => d.text === "Yes, it's two blocks away, next to the market." && d.value === 255));
  assert.ok(!back.draws.some((d) => d.text.endsWith('ticket office.')));
});

test('speech outside the pair is shown as said; missing and rejected keys', async () => {
  const app = await open();
  app.socket().open();
  app.socket().send([...original('Sí, está a dos cuadras.', 'es'), ...translation("Yes, it's two blocks away.", 'en', 'es'), END]);
  app.socket().send([{ text: 'Bonjour', is_final: true, language: 'fr', translation_status: 'none' }, { text: ' à tous', is_final: true, language: 'fr', translation_status: 'none' }]);
  const other = app.shot('translate-app-other-language');
  assert.ok(other.draws.some((d) => d.text === 'Bonjour à tous' && d.value === 255));

  const missing = await open({ apiKey: '' });
  const shot = missing.shot('translate-app-missing-key');
  assert.ok(shot.draws.some((d) => d.text === 'Soniox key missing' && d.value === 255 && d.y === 14));

  const rejected = await open();
  rejected.socket().config.onError('Soniox: Invalid API key. (401)');
  const failed = rejected.shot('translate-app-failed');
  assert.ok(failed.draws.some((d) => d.text === 'Translation stopped'));
  assert.ok(failed.draws.some((d) => d.text === 'The Soniox key was rejected.' && d.value === 120));
});
