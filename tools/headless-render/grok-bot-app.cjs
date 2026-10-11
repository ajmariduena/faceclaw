// node tools/headless-render/grok-bot-app.cjs  →  out/bots-*.png
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { loader } = require('../../tests/helpers/load-typescript.cjs');
const { COLUMN_ICONS, CARD_ICONS } = require('./home-column.cjs');

const START = new Date(2026, 9, 10, 9, 41).getTime();
let nowMs = START;
class ClockDate extends Date {
  constructor(...args) { if (args.length) super(...args); else super(nowMs); }
  static now() { return nowMs; }
}

const { adapter } = createRenderContext();
let graphics, face, hub, captured;
let yielded = 0;
const settingsStore = { getStringSetting: (_key, fallback) => fallback, setStringSetting() {}, onSettingsStoreChanged: () => () => {} };
const setting = (value) => ({ get: () => value, set() {} });
const load = loader({ global: { isAndroid: true, isIOS: false }, Date: ClockDate, Uint32Array, Int32Array, DataView, ArrayBuffer,
  setInterval: () => 0, clearInterval() {}, setTimeout, clearTimeout }, {
  '@nativescript/core': { knownFolders: {} },
  '../native/font-renderer': { fontRenderer: adapter.fontRenderer },
  '../native/settings-store': settingsStore,
  '../../native/settings-store': settingsStore,
  './installed-fonts': { ensurePreinstalledFonts() {}, installedFontPath: () => adapter.fontPath },
  '../native/svg-rasterizer': { rasterizeSvg: (svg, size, stroke) => adapter.rasterizeSvg(svg, size, stroke, graphics.GrayImage) },
  '../native/frame-timings': { spanCurrent: (_name, fn) => fn() },
  '../native/texture-atlas': { textureGlassesAvailable: () => false },
  '../../native/voice-control': { voiceControlBridge: { onTranscript: () => () => {}, onStatus: () => () => {} } },
  '../../ui/shell/voice-activity': { voiceActivity: { setActive() {} } },
  '../../ui/dashboard-settings': { timeFormatSetting: setting('24h'), developerInMoreSetting: setting(false),
    botsChatDraftSetting: setting(''), botsWakeOnReplySetting: setting(true), toggleSettingMenuItem: (s) => ({ label: s.label, onSelect() {} }) },
  '../../ui/terminal-face': { terminalFace: () => face },
  '../../ui/shell/shell': { shell: { isScreenOn: () => true, isWindowVisible: () => false, prepareChatVoiceCapture: async () => true,
    showAlert() {}, yieldFocusToSidebar() { yielded++; } } },
  '../../ui/shell/in-process-window': { createInProcessWindow: (options) => { captured = options; return { requestRender() {} }; } },
  '../../assistant/grokbot/grokbot': { get grokBotHub() { return hub; } },
});
graphics = load('app/graphics/image.ts');
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const { ICON_SVGS } = load('app/graphics/icons.ts');
const { GrokBotHub } = load('app/assistant/grokbot/grokbot-hub.ts');
const { botsGlance } = load('app/apps/bots/bots-model.ts');
const { launchBots } = load('app/apps/bots/bots-app.ts');

const outDir = path.join(__dirname, 'out');
const written = [];

function save(band, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  written.push(file);
}

/** Refuse any text that leaves its image or needs a glyph the firmware font lacks. */
function tracing(stock) {
  const draws = [];
  return { draws, face: {
    lineHeight: stock.lineHeight,
    measureLine: (text) => stock.measureLine(text),
    drawText: (image, x, y, text, value = 255) => {
      for (const char of text) assert.ok(char === ' ' || stock.hasGlyph(char.codePointAt(0)), `missing stock glyph: ${char} in "${text}"`);
      assert.ok(x >= 0 && x + stock.measureLine(text) <= image.width, `"${text}" overflows at x=${x}`);
      assert.ok(y >= 0 && y + stock.lineHeight <= image.height, `"${text}" outside at y=${y}`);
      draws.push({ text, value, x, y });
      stock.drawText(image, x, y, text, value);
    },
  } };
}

function fakeCursor() {
  const pages = new Map(), cursors = new Map();
  let key = 'cursor-key';
  const reply = (body) => ({ status: 200, text: async () => JSON.stringify(body) });
  const fetch = async (url, init) => {
    if (key !== 'cursor-key') return { status: 401, text: async () => '' };
    const body = init.body ? JSON.parse(init.body) : {};
    const route = url.replace('https://api.cursor.com/v0/grokbot/sessions', '');
    if (!route) return reply({ id: body.name, name: body.name, createdAtMs: body.name === 'Glases' ? nowMs : START - 86_400_000, latestUpdatedSeq: 0 });
    const id = decodeURIComponent(route.split('/')[1]);
    if (route.endsWith('/messages')) return reply({ messageId: body.messageId, delivery: 'accepted_temporal' });
    if (route.endsWith('/interrupt')) return reply({ interrupted: true });
    const page = pages.get(id)?.shift() ?? { entries: [], turn: { idle: true, inFlight: false, queued: 0 } };
    for (const entry of page.entries) cursors.set(id, Math.max(cursors.get(id) ?? 0, entry.updatedSeq));
    return reply({ latestUpdatedSeq: cursors.get(id) ?? 0, ...page });
  };
  const push = (bot, entries, busy = false) => {
    if (!pages.has(bot)) pages.set(bot, []);
    pages.get(bot).push({ entries, turn: busy ? { idle: false, inFlight: true, queued: 0 } : { idle: true, inFlight: false, queued: 0 } });
  };
  return { fetch, push, setKey: (value) => { key = value; } };
}

const user = (seq, text, minutesAgo) => ({ seq, updatedSeq: seq, kind: 'message', role: 'user', text, createdAtMs: nowMs - minutesAgo * 60_000 });
const bot = (seq, text, minutesAgo = 0) => ({ seq, updatedSeq: seq, kind: 'send-message', text, createdAtMs: nowMs - minutesAgo * 60_000 });
const FULL = 'Para el jueves 15, el vuelo directo más barato es de **LATAM**: USD 68 a las 5:20 a. m. Por aerolínea:\n\n- LATAM, USD 68, directo, 52 minutos.\n- Avianca, USD 77, directo, 55 minutos.\n- Copa, USD 404, con escala en Panamá.\n\nHorarios: [vuelos Guayaquil–Quito](https://www.google.com/travel/flights/search?tfs=EAAaHhIK&curr=USD). Si quieres, reservo LATAM.';

async function main() {
  const stock = await stockFont(graphics);
  await adapter.prepareIcons([...new Set([...COLUMN_ICONS, ...CARD_ICONS])].map((name) => ICON_SVGS[name]));
  const api = fakeCursor();
  let names = ['Glasses'];
  hub = new GrokBotHub({ fetch: api.fetch, apiKey: () => 'cursor-key', botNames: () => names, loadCache: () => '', saveCache() {},
    now: () => nowMs, setTimeout: () => 0, clearTimeout() {} });
  const advance = (seconds) => { nowMs += seconds * 1000; };
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(setImmediate); };

  api.push('Glasses', [user(1, '¿A qué hora sale mi vuelo del martes?', 70), bot(2, 'Sale 06:20 desde GYE; el check-in ya está abierto.', 69)]);
  hub.start();
  await settle();

  const ctx = { launchInProcessApp: async (_id, _surface, create) => { if (!captured) create({ actions: { startVoiceCapture() {}, stopVoiceCapture() {}, startTextSettingEdit() {} }, setSurfaceVisible() {}, onClosed() {} }); },
    launchApp: async () => {} };
  await launchBots(ctx);
  const layer = captured.baseLayer;
  const paintCtx = { stack: { getBaseSize: () => ({ width: 576, height: 288 }), clearToBase() {} } };
  const scene = (name) => {
    const traced = tracing(stock);
    face = traced.face;
    save(layer.paint(paintCtx), name);
    return traced.draws.map((draw) => draw.text);
  };
  const input = (type) => layer.handleInput({ type });

  {
    const traced = tracing(stock);
    const home = paintHome(1, { now: new Date(nowMs), calendar: calendarCardState(true, [], nowMs), paseo: null, battery: { ring: 60, glasses: 82 },
      weather: { temperatureC: 27.4, code: 2, isDay: true, atMs: nowMs }, bots: botsGlance(hub, nowMs) }, traced.face);
    save(home, 'bots-home');
    const texts = traced.draws.map((draw) => draw.text);
    assert.ok(texts.includes('Glasses · 1 h'), texts.join(' | '));
  }

  let texts = scene('bots-chat-idle');
  assert.equal(texts.at(-1), '· Glasses');

  const sent = hub.send('Glasses', 'Busca vuelos más baratos a Quito el jueves');
  await sent;
  advance(3);
  api.push('Glasses', [user(3, 'Busca vuelos más baratos a Quito el jueves', 0), bot(4, 'Busco vuelos, te aviso.')], true);
  await hub.refresh();
  advance(9);
  texts = scene('bots-chat-working');
  assert.deepEqual(texts.slice(-2), ['· Working', '0:12']);

  advance(10);
  api.push('Glasses', [bot(5, FULL)], true);
  await hub.refresh();
  advance(2);
  await hub.refresh();
  texts = scene('bots-chat-reply');
  assert.equal(texts.at(-1), '· Glasses');
  assert.ok(texts.some((text) => text.startsWith('· Copa')) && texts.some((text) => text.includes('reservo LATAM')), texts.join(' | '));
  assert.ok(!texts.some((text) => /\*\*|\]\(|https?:/.test(text)), `markdown left: ${texts.join(' | ')}`);

  input('scroll-up');
  texts = scene('bots-chat-scrolled');
  assert.deepEqual(texts.slice(-2), ['· Glasses', 'older']);
  assert.ok(texts.some((text) => text.startsWith('Para el jueves 15')), texts.join(' | '));
  input('scroll-down');

  await hub.send('Glasses', 'Reserva el de LATAM');
  api.push('Glasses', [user(6, 'Reserva el de LATAM', 0), bot(7, 'Ya estoy en eso.')], true);
  await hub.refresh();
  layer.menuItems().find((item) => item.label === 'Stop').onSelect(paintCtx);
  await new Promise(setImmediate);
  texts = scene('bots-chat-stopped');
  assert.ok(texts.includes('> Stopped · Glasses'), texts.join(' | '));

  layer.reviewText('Busca si hay vuelos más baratos el viernes');
  texts = scene('bots-chat-draft');
  assert.ok(texts.includes('Draft') && texts.includes('Send'), texts.join(' | '));
  input('double-click');
  assert.equal(yielded, 0, 'double tap discards the draft first');
  input('double-click');
  assert.equal(yielded, 1, 'then leaves Bots');

  names = ['Glases'];
  hub.configChanged();
  await settle();
  texts = scene('bots-chat-new-empty');
  assert.ok(texts.includes('New empty bot · name not found'), texts.join(' | '));

  api.setKey('revoked');
  names = ['Glasses'];
  hub.configChanged();
  await settle();
  texts = scene('bots-chat-key-rejected');
  assert.ok(texts.includes('Cursor key rejected · fix on phone'), texts.join(' | '));

  for (const file of written) console.log(file);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
