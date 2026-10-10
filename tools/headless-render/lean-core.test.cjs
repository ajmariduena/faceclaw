/**
 * The lean CORE screens through the production painters and the extracted
 * stock font: the five home cards with their states, More, Converse, the
 * Settings status list and Timers. Writes out/lean-core-*.png for eyeballing
 * against the approved renders (lean-ux-fable.cjs) and checks the geometry
 * those fixed: the terminal frame, the 27 px pitch, English chrome, no
 * gesture hints, nothing drawn outside the band.
 *
 *   node --test tools/headless-render/lean-core.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { loader } = require('../../tests/helpers/load-typescript.cjs');

const context = createRenderContext();
const { graphics, TtfFont, adapter, load } = context;
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const outDir = path.join(__dirname, 'out');

const NOW = new Date(2026, 9, 10, 9, 41);
const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

// The terminal screens' modules reach the shell and settings; stub those boundaries only.
const statuses = {
  'apiKeys.status.openrouter': JSON.stringify({ state: 'ok', at: NOW.getTime(), ms: 320, error: null }),
  'apiKeys.status.parallel': JSON.stringify({ state: 'failed', at: NOW.getTime(), ms: null, error: 'Invalid key (401)' }),
};
const leanLoad = loader({ Uint32Array, Int32Array, DataView, ArrayBuffer, Date }, {
  '@nativescript/core': { knownFolders: {} },
  '../../ui/terminal-face': { terminalFace: () => { throw new Error('painters take the face explicitly'); } },
  '../../ui/shell/shell': { shell: { getBatteryLevels: () => ({ headset: 82, ring: 60 }) } },
  '../../ui/shell/in-process-window': { createInProcessWindow: () => ({}) },
  '../../ui/dashboard-settings': {
    developerInMoreSetting: { get: () => false }, sonioxApiKeySetting: { get: () => 'key' },
    brightnessSetting: { get: () => '50', set() {} }, BRIGHTNESS_VALUES: ['auto', '50'],
    brightnessLabel: value => value === 'auto' ? 'Auto' : `${value}%`, onAnySettingChanged: () => () => {},
  },
  '../../native/settings-store': { getStringSetting: (key, fallback) => statuses[key] ?? fallback },
  '../../ui/shell/worker-state': { readWorkerState: () => ({ configured: true, status: '', updates: [], needs: 0, working: 0 }) },
  './timer-engine': { timerEngine: {} },
});
const leanGraphics = leanLoad('app/graphics/image.ts');
const { paintMoreList, moreRows } = leanLoad('app/apps/launcher/more-list.ts');
const { paintConversePlaceholder } = leanLoad('app/apps/converse/converse-app.ts');
const { statusRows } = leanLoad('app/apps/settings/status-layer.ts');
const { paintTerminalList } = leanLoad('app/ui/terminal.ts');
const { paintTimersList } = leanLoad('app/apps/timer/timers-list.ts');

const facePromise = stockFont(graphics);
const leanFacePromise = stockFont(leanGraphics);
const clockFont = TtfFont.load(adapter.fontPath, 80);
const clockFace = { lineHeight: clockFont.lineHeight, measureLine: text => clockFont.measureText(text), drawText: (...args) => clockFont.drawText(...args) };

const SPANISH = /Sábado|Toca|Sin |Más|Traducir|Calendario|Conectando|Ahora|Todo el día|Mañana/;
const HINTS = /Tap |Hold |tap to|hold to|Listening\.\.\.|scroll to/i;

/** Record every text draw and refuse any that leaves its image. */
function tracing(face) {
  const draws = [];
  const traced = {
    lineHeight: face.lineHeight,
    measureLine: text => face.measureLine(text),
    drawText: (image, x, y, text, value = 255) => {
      assert.ok(x >= 0 && x + face.measureLine(text) <= image.width, `${text} overflows at x=${x}`);
      assert.ok(y >= 0 && y + face.lineHeight <= image.height, `${text} outside at y=${y}`);
      assert.ok(!SPANISH.test(text), `Spanish chrome: ${text}`);
      assert.ok(!HINTS.test(text), `gesture hint: ${text}`);
      draws.push({ text, x, y, value });
      face.drawText(image, x, y, text, value);
    },
  };
  return { draws, face: traced, texts: () => draws.map(draw => draw.text) };
}

function save(g, band, name) {
  const out = new g.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = g.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  return file;
}

function checkFrame(image) {
  const baked = image.withDrawsBaked();
  assert.equal(baked.getPixel(100, 4), 255, 'top edge');
  assert.equal(baked.getPixel(100, 283), 255, 'bottom edge');
  assert.equal(baked.getPixel(4, 100), 255, 'left edge');
  assert.equal(baked.getPixel(571, 100), 255, 'right edge');
  assert.equal(baked.getPixel(100, 244), 119, 'footer rule');
  for (let x = 0; x < 576; x++) assert.equal(baked.getPixel(x, 0), 0);
  for (let y = 0; y < 288; y++) assert.equal(baked.getPixel(0, y), 0);
}

const event = (title, startMs, endMs, extra = {}) => ({ title, startMs, endMs, allDay: false, ...extra });
const daily = event('Daily con el equipo', at(10, 10, 30), at(10, 11));
const lunch = event('Almuerzo con Lucía', at(10, 13), at(10, 14), { location: 'Café Jardín' });
const review = event('Revisión de diseño', at(10, 15), at(10, 16));
const dentist = event('Dentista', at(11, 9), at(11, 10));
const PASEO = { configured: true, status: '', needs: 1, working: 1, updates: [
  { agentId: 'a1', title: 'Fix reconnect BLE', bucket: 'needs', activityMs: NOW.getTime() - 60_000, line: '¿Apruebo correr los tests de BLE?' },
  { agentId: 'a2', title: 'PR #1221 jelou-cli', bucket: 'review', activityMs: NOW.getTime() - 240_000, line: 'Listo para fusionar a producción.' },
] };

test('home: the five cards and their states, Paseo first with five dots', async () => {
  const stock = await facePromise;
  const scenes = [
    ['home-paseo', 0, { paseo: PASEO }],
    ['home-paseo-unreachable', 0, { paseo: { configured: true, status: 'Mac unreachable', updates: [], needs: 0, working: 0 } }],
    ['home-paseo-unpaired', 0, { paseo: null }],
    ['home-calendar', 1, { calendar: calendarCardState(true, [daily, lunch, review], NOW.getTime()) }],
    ['home-calendar-tomorrow', 1, { calendar: calendarCardState(true, [daily, dentist], NOW.getTime()) }],
    ['home-calendar-empty', 1, { calendar: calendarCardState(true, [daily], NOW.getTime()) }],
    ['home-translate-ready', 2, { translateReady: true }],
    ['home-translate-setup', 2, { translateReady: false }],
    ['home-converse', 3, {}],
    ['home-more', 4, {}],
  ];
  for (const [name, selected, extra] of scenes) {
    const { face, texts } = tracing(stock);
    const data = { now: NOW, calendar: calendarCardState(true, [daily], NOW.getTime()), paseo: null, ...extra };
    const image = paintHome(selected, data, face, clockFace);
    for (let i = 0; i < 5; i++) assert.equal(image.getPixel(218, 120 + i * 11), i === selected ? 255 : 85, `${name} dot ${i}`);
    assert.equal(image.getPixel(218, 120 + 5 * 11), 0, `${name}: no sixth dot`);
    assert.equal(image.getPixel(250, 14), 255, `${name}: card border`);
    for (let y = 0; y < 288; y++) for (let x = 548; x < 576; x++) assert.equal(image.getPixel(x, y), 0);
    assert.ok(texts().includes('Saturday, Oct 10'), name);
    assert.ok(texts().includes('10:30 · in 49 min'), name);
    save(graphics, image, `lean-core-${name}`);
  }
});

test('More: the four fixed rows at a 46 px pitch, "· More 1/4", icons dim with their row', async () => {
  const stock = await leanFacePromise;
  for (const [name, selected, rows] of [['more', 0, moreRows(false)], ['more-settings', 3, moreRows(false)], ['more-developer', 4, moreRows(true)]]) {
    const { face, draws, texts } = tracing(stock);
    const image = new leanGraphics.GrayImage(576, 288);
    paintMoreList(image, face, selected, rows);
    checkFrame(image);
    assert.equal(texts().slice(0, rows.length + 1).filter(text => text !== '>').join('|'), rows.map(row => row.label).join('|'));
    assert.equal(texts().at(-2), '· More');
    assert.equal(texts().at(-1), `${selected + 1}/${rows.length}`);
    const labels = draws.filter(draw => rows.some(row => row.label === draw.text));
    assert.equal(labels.map(draw => draw.y).join(), rows.map((_, index) => 24 + index * 46).join());
    assert.equal(draws.find(draw => draw.text === '>').y, 24 + selected * 46 + 3);
    save(leanGraphics, image, `lean-core-${name}`);
  }
});

test('Converse placeholder, Settings status rows and Timers share the frame and footer', async () => {
  const stock = await leanFacePromise;
  {
    const { face, texts } = tracing(stock);
    const image = new leanGraphics.GrayImage(576, 288);
    paintConversePlaceholder(image, face);
    checkFrame(image);
    assert.equal(texts().join('|'), 'Not built yet|Live facts · ES/EN|· Converse');
    save(leanGraphics, image, 'lean-core-converse');
  }
  {
    const { face, draws, texts } = tracing(stock);
    const image = new leanGraphics.GrayImage(576, 288);
    const rows = statusRows({ glasses: 82, ring: 60, paseo: 'connected', brightness: '50',
      keys: [{ label: 'Soniox', value: 'ok' }, { label: 'OpenRouter', value: 'ok' }, { label: 'Parallel', value: 'failed' }] });
    paintTerminalList(image, face, { rows, selected: 6, footer: { left: '· Settings', right: '' } });
    checkFrame(image);
    assert.equal(rows.length, 8, 'all rows fit without scrolling');
    assert.equal(draws.filter(draw => draw.x === 42).map(draw => draw.text).join('|'),
      'Glasses battery|Ring battery|Paseo|Soniox|OpenRouter|Parallel|Brightness|Disconnect');
    assert.ok(texts().includes('82%') && texts().includes('60%') && texts().includes('failed') && texts().includes('50%'));
    assert.equal(draws.find(draw => draw.text === '>').y, draws.find(draw => draw.text === 'Brightness').y);
    save(leanGraphics, image, 'lean-core-settings');
  }
  {
    const now = NOW.getTime();
    const timers = [
      { id: 1, label: 'Té', durationMs: 600_000, endsAtMs: now + 180_000, pausedRemainingMs: null, rungAtMs: null, createdAtMs: now - 420_000 },
      { id: 2, label: '', durationMs: 1_800_000, endsAtMs: now + 1_500_000, pausedRemainingMs: null, rungAtMs: null, createdAtMs: now - 100 },
      { id: 3, label: 'Pasta', durationMs: 480_000, endsAtMs: null, pausedRemainingMs: 120_000, rungAtMs: null, createdAtMs: now - 500_000 },
    ];
    for (const [name, view] of [
      ['timers', { timers, nowMs: now, selected: 0, confirm: null }],
      ['timers-confirm', { timers, nowMs: now, selected: 0, confirm: 0 }],
      ['timers-empty', { timers: [], nowMs: now, selected: 0, confirm: null }],
    ]) {
      const { face, texts } = tracing(stock);
      const image = new leanGraphics.GrayImage(576, 288);
      paintTimersList(image, face, view);
      checkFrame(image);
      assert.ok(texts().includes('· Timers'), name);
      if (name === 'timers') { assert.ok(texts().includes('3:00')); assert.ok(texts().includes('30 min')); assert.ok(texts().includes('paused 2:00')); assert.ok(texts().includes('2 active')); }
      if (name === 'timers-confirm') { assert.ok(texts().includes('Cancel Té?')); assert.ok(texts().includes('Cancel timer')); assert.ok(texts().includes('Keep')); }
      if (name === 'timers-empty') assert.ok(texts().includes('No active timers'));
      save(leanGraphics, image, `lean-core-${name}`);
    }
  }
});
