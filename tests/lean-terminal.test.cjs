const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/load-typescript.cjs');

const font = (() => {
  const { BdfFont } = loader({ Uint32Array, Int32Array, DataView, ArrayBuffer }, { '@nativescript/core': { knownFolders: {} } })('app/graphics/bdffont.ts');
  return BdfFont.parse(fs.readFileSync('app/fonts/terminus/ter-u20n.bdf', 'utf8'));
})();

function env({ developer = false, brightness = 'auto', soniox = '', statuses = {}, battery = { headset: 82, ring: 60 }, paseo } = {}) {
  const draws = [];
  const face = {
    lineHeight: font.lineHeight,
    measureLine: text => font.measureText(text),
    drawText(image, x, y, text, value = 255) {
      assert.ok(x >= 0 && x + font.measureText(text) <= image.width, `${text} overflows at ${x}`);
      assert.ok(y >= 0 && y + font.lineHeight <= image.height, `${text} outside at ${y}`);
      draws.push({ text, value, x, y });
      font.drawText(image, x, y, text, value);
    },
  };
  const yields = [], launched = [], disconnects = [];
  let brightnessValue = brightness;
  const settings = {
    developerInMoreSetting: { get: () => developer },
    sonioxApiKeySetting: { get: () => soniox },
    brightnessSetting: { get: () => brightnessValue, set: value => { brightnessValue = value; } },
    BRIGHTNESS_VALUES: ['auto', '2', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'],
    brightnessLabel: value => value === 'auto' ? 'Auto' : `${value}%`,
    onAnySettingChanged: () => () => {},
  };
  const nowBox = { ms: new Date(2026, 9, 10, 9, 41).getTime() };
  class ClockDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(nowBox.ms); }
    static now() { return nowBox.ms; }
  }
  const load = loader({ Uint32Array, Int32Array, DataView, ArrayBuffer, Date: ClockDate }, {
    '@nativescript/core': { knownFolders: {} },
    '../../ui/terminal-face': { terminalFace: () => face },
    '../../ui/shell/shell': { shell: { yieldFocusToSidebar: () => yields.push(1), getBatteryLevels: () => battery } },
    '../../ui/dashboard-settings': settings,
    '../../native/settings-store': { getStringSetting: (key, fallback) => statuses[key] ?? fallback },
    '../../ui/shell/worker-state': { readWorkerState: () => paseo },
    '../../ui/shell/in-process-window': { createInProcessWindow: () => ({}) },
    './timer-engine': { timerEngine: {} },
  });
  const ctx = { stack: { getBaseSize: () => ({ width: 576, height: 288 }) }, actions: { disconnect: () => disconnects.push(1) } };
  return { load, face, draws, ctx, yields, launched, disconnects, nowBox, texts: () => draws.map(d => d.text), brightness: () => brightnessValue };
}

test('terminal list helpers: fit, scroll window, selectable stepping and row painting', () => {
  const e = env();
  const t = e.load('app/ui/terminal.ts');
  assert.equal(t.PITCH, 27);
  assert.equal(t.LIST_CAPACITY, 8);
  assert.equal(t.fitLine(e.face, 'short', 100), 'short');
  assert.ok(t.fitLine(e.face, 'a very long line that cannot fit', 60).endsWith('…'));
  assert.equal(t.listScrollTop(10, 0, 0), 0);
  assert.equal(t.listScrollTop(10, 9, 0), 2);
  assert.equal(t.listScrollTop(10, 8, 0), 1);
  assert.equal(t.listScrollTop(20, 3, 5), 3);
  assert.equal(t.listScrollTop(10, 3, 5), 2, 'never past the last page');
  assert.equal(t.listScrollTop(3, 2, 0), 0);
  const rows = [{ label: 'a', selectable: false }, { label: 'b' }, { label: 'c', selectable: false }, { label: 'd' }];
  assert.equal(t.stepSelection(rows, 1, -1), 1);
  assert.equal(t.stepSelection(rows, 1, 1), 3);
  assert.equal(t.stepSelection(rows, 3, 1), 3);
  const { GrayImage } = e.load('app/graphics/image.ts');
  const image = new GrayImage(576, 288);
  t.paintTerminalList(image, e.face, { rows, selected: 1, footer: { left: '· Test', right: '2/4' } });
  const b = e.draws.find(d => d.text === 'b');
  assert.equal(b.value, 255);
  assert.equal(e.draws.find(d => d.text === 'd').value, 136);
  assert.equal(e.draws.find(d => d.text === '>').y, b.y);
  assert.equal(e.draws.find(d => d.text === '· Test').y, 252);
  assert.equal(image.getPixel(4, 100), 255, 'frame');
  assert.equal(image.getPixel(100, 244), 119, 'rule');
  e.draws.length = 0;
  t.paintTerminalList(image, e.face, { rows: [], selected: -1, footer: { left: '· Test', right: '' }, message: 'Nothing here' });
  assert.deepEqual(e.texts(), ['Nothing here', '· Test']);
});

test('More: four fixed rows, scroll stops at the ends, tap launches, double tap returns home', async () => {
  const e = env();
  const { MoreListLayer, MORE_ROWS, moreRows, paintMoreList } = e.load('app/apps/launcher/more-list.ts');
  assert.equal(MORE_ROWS.map(row => row.label).join('|'), 'AI Chat|Timers|Navigate|Settings');
  assert.equal(MORE_ROWS.map(row => row.appId).join('|'), 'ai-chat|timer|navigate|settings');
  assert.equal(moreRows(false).length, 4);
  assert.equal(moreRows(true).at(-1).appId, 'developer');
  const layer = new MoreListLayer(async appId => e.launched.push(appId));
  layer.paint(e.ctx);
  assert.deepEqual(e.texts(), ['>', 'AI Chat', 'Timers', 'Navigate', 'Settings', '· More', '1/4']);
  assert.equal(e.draws.find(d => d.text === 'AI Chat').value, 255);
  assert.equal(e.draws.find(d => d.text === 'Timers').value, 136);
  await layer.handleInput({ type: 'scroll-up' });
  assert.equal(layer.selectedIndex, 0);
  for (let i = 0; i < 6; i++) await layer.handleInput({ type: 'scroll-down' });
  assert.equal(layer.selectedIndex, 3);
  e.draws.length = 0;
  layer.paint(e.ctx);
  assert.ok(e.texts().includes('4/4'));
  await layer.handleInput({ type: 'click' });
  assert.deepEqual(e.launched, ['settings']);
  await layer.handleInput({ type: 'double-click' });
  assert.equal(e.yields.length, 1);
  assert.equal(await layer.hitTest(200, 24 + 46 + 10), true);
  assert.deepEqual(e.launched, ['settings', 'timer']);
  assert.equal(await layer.hitTest(200, 280), false);
  const { GrayImage } = e.load('app/graphics/image.ts');
  e.draws.length = 0;
  paintMoreList(new GrayImage(576, 288), e.face, 4, moreRows(true));
  assert.ok(e.texts().includes('Developer'));
  assert.ok(e.texts().includes('5/5'));
});

test('Settings: status rows read batteries, the Paseo link and the phone\'s key tests; brightness and Disconnect act', async () => {
  const statuses = {
    'apiKeys.status.openrouter': JSON.stringify({ state: 'ok', at: 1, ms: 320, error: null }),
    'apiKeys.status.parallel': JSON.stringify({ state: 'failed', at: 1, ms: null, error: 'Invalid key (401)' }),
    'apiKeys.status.soniox': JSON.stringify({ state: 'ok', at: 1, ms: 200, error: null }),
  };
  const e = env({ statuses, soniox: '', brightness: '50', paseo: { configured: true, status: '', updates: [], needs: 0, working: 0 } });
  const s = e.load('app/apps/settings/status-layer.ts');
  assert.deepEqual(s.readKeyTestStatus('openrouter', (key, fallback) => statuses[key] ?? fallback).state, 'ok');
  assert.equal(s.readKeyTestStatus('missing', () => ''), null);
  assert.equal(s.readKeyTestStatus('bad', () => '{nope'), null);
  assert.equal(s.readKeyTestStatus('odd', () => JSON.stringify({ state: 'weird' })), null);
  assert.equal(s.keyStatusValue(false, { state: 'ok' }), 'missing');
  assert.equal(s.keyStatusValue(true, null), 'untested');
  assert.equal(s.keyStatusValue(null, { state: 'failed' }), 'failed');
  assert.equal(s.paseoStatus(null), 'not paired');
  assert.equal(s.paseoStatus({ configured: true, status: 'Mac unreachable' }), 'unreachable');
  assert.equal(s.paseoStatus({ configured: true, status: '' }), 'connected');
  const layer = new s.StatusLayer();
  layer.paint(e.ctx);
  const row = label => { const d = e.draws.find(x => x.text === label); return e.draws.find(x => x.y === d.y && x !== d && x.text !== '>')?.text; };
  assert.equal(row('Glasses battery'), '82%');
  assert.equal(row('Ring battery'), '60%');
  assert.equal(row('Paseo'), 'connected');
  assert.equal(row('Soniox'), 'missing', 'no key stored beats the phone\'s stale ok');
  assert.equal(row('OpenRouter'), 'ok');
  assert.equal(row('Parallel'), 'failed');
  assert.equal(row('Brightness'), '50%');
  assert.equal(e.draws.find(d => d.text === '>').y, e.draws.find(d => d.text === 'Brightness').y, 'opens on the first actionable row');
  assert.ok(e.texts().includes('· Settings'));
  await layer.handleInput({ type: 'scroll-up' }, e.ctx);
  e.draws.length = 0; layer.paint(e.ctx);
  assert.equal(e.draws.find(d => d.text === '>').y, e.draws.find(d => d.text === 'Brightness').y, 'status rows are not selectable');
  await layer.handleInput({ type: 'click' }, e.ctx);
  assert.equal(layer.isAdjusting, true);
  await layer.handleInput({ type: 'scroll-up' }, e.ctx);
  assert.equal(e.brightness(), '60');
  await layer.handleInput({ type: 'scroll-down' }, e.ctx);
  await layer.handleInput({ type: 'scroll-down' }, e.ctx);
  assert.equal(e.brightness(), '40');
  e.draws.length = 0; layer.paint(e.ctx);
  assert.ok(e.texts().includes('· Brightness'));
  await layer.handleInput({ type: 'double-click' }, e.ctx);
  assert.equal(layer.isAdjusting, false);
  assert.equal(e.yields.length, 0);
  await layer.handleInput({ type: 'scroll-down' }, e.ctx);
  await layer.handleInput({ type: 'click' }, e.ctx);
  assert.equal(e.disconnects.length, 1);
  await layer.handleInput({ type: 'scroll-down' }, e.ctx);
  await layer.handleInput({ type: 'double-click' }, e.ctx);
  assert.equal(e.yields.length, 1);
  const empty = env({ battery: { headset: null, ring: null } });
  new (empty.load('app/apps/settings/status-layer.ts').StatusLayer)().paint(empty.ctx);
  assert.ok(empty.texts().includes('n/a'));
  assert.ok(empty.texts().includes('not paired'));
  assert.ok(empty.texts().includes('untested'));
});

test('Timers: lists active countdowns with remaining time, cancels after a nested confirmation', async () => {
  const e = env();
  const t = e.load('app/apps/timer/timers-list.ts');
  assert.equal(t.formatRemaining(5_000), '0:05');
  assert.equal(t.formatRemaining(9 * 60_000 + 41_000), '9:41');
  assert.equal(t.formatRemaining(3_600_000 + 2 * 60_000 + 3_000), '1:02:03');
  assert.equal(t.formatDurationLabel(10 * 60_000), '10 min');
  assert.equal(t.formatDurationLabel(90 * 60_000), '1 h 30 min');
  assert.equal(t.formatDurationLabel(45_000), '45 s');
  const now = e.nowBox.ms;
  const timers = [
    { id: 1, label: 'Tea', durationMs: 600_000, endsAtMs: now + 180_000, pausedRemainingMs: null, rungAtMs: null, createdAtMs: now - 420_000 },
    { id: 2, label: '', durationMs: 1_800_000, endsAtMs: null, pausedRemainingMs: 900_000, rungAtMs: null, createdAtMs: now - 100 },
    { id: 3, label: 'Pasta', durationMs: 480_000, endsAtMs: now - 1000, pausedRemainingMs: null, rungAtMs: now - 1000, createdAtMs: now - 500_000 },
  ];
  const removed = [];
  const engine = { check() {}, timers: () => timers.filter(timer => !removed.includes(timer.id)), removeTimer: id => removed.push(id) };
  const layer = new t.TimersListLayer(engine, () => e.nowBox.ms);
  layer.paint(e.ctx);
  const row = label => { const d = e.draws.find(x => x.text === label); return e.draws.find(x => x.y === d.y && x !== d && x.text !== '>')?.text; };
  assert.equal(row('Tea'), '3:00');
  assert.equal(row('30 min'), 'paused 15:00');
  assert.equal(row('Pasta'), 'ringing');
  assert.ok(e.texts().includes('· Timers'));
  assert.ok(e.texts().includes('1 active'));
  layer.onEngineChanged();
  e.draws.length = 0; layer.paint(e.ctx);
  assert.equal(e.draws.find(d => d.text === '>').y, e.draws.find(d => d.text === 'Pasta').y, 'a ringing timer takes the selection');
  layer.handleInput({ type: 'click' });
  e.draws.length = 0; layer.paint(e.ctx);
  assert.ok(e.texts().includes('Dismiss Pasta?'));
  assert.ok(e.texts().includes('Dismiss'));
  assert.ok(e.texts().includes('Keep'));
  layer.handleInput({ type: 'scroll-down' });
  layer.handleInput({ type: 'click' });
  assert.deepEqual(removed, [], 'Keep leaves it');
  layer.handleInput({ type: 'click' });
  layer.handleInput({ type: 'click' });
  assert.deepEqual(removed, [3]);
  layer.handleInput({ type: 'scroll-up' });
  layer.handleInput({ type: 'scroll-up' });
  layer.handleInput({ type: 'click' });
  e.draws.length = 0; layer.paint(e.ctx);
  assert.ok(e.texts().includes('Cancel Tea?'));
  assert.ok(e.texts().includes('Cancel timer'));
  layer.handleInput({ type: 'double-click' });
  assert.equal(e.yields.length, 0, 'double tap closes the prompt first');
  layer.handleInput({ type: 'double-click' });
  assert.equal(e.yields.length, 1);
  removed.push(1, 2);
  e.draws.length = 0; layer.paint(e.ctx);
  assert.deepEqual(e.texts(), ['No active timers', '· Timers']);
});

test('Converse placeholder paints the frame with Not built yet', () => {
  const e = env();
  const { paintConversePlaceholder } = e.load('app/apps/converse/converse-app.ts');
  const { GrayImage } = e.load('app/graphics/image.ts');
  paintConversePlaceholder(new GrayImage(576, 288), e.face);
  assert.deepEqual(e.texts(), ['Not built yet', 'Live facts · ES/EN', '· Converse']);
  assert.equal(e.draws[0].value, 255);
  assert.equal(e.draws[1].value, 136);
});

test('the registry hides the spec\'s apps from the lean UI without dropping them, and adds Converse', () => {
  const ids = [];
  const load = loader({}, new Proxy({}, { get: (_, name) => (name.startsWith('./') && name !== './app-definition'
    ? { default: { appId: name.slice(2) } } : {}), has: (_, name) => name !== './app-definition' }));
  const { ALL_APPS, LEAN_HIDDEN_APP_IDS } = load('app/apps/all-apps.ts');
  for (const app of ALL_APPS) ids.push(app.appId);
  assert.ok(ids.includes('converse'));
  for (const id of ['paseo', 'calendar', 'ai-chat', 'timer', 'navigate', 'settings', 'launcher', 'home']) assert.ok(!LEAN_HIDDEN_APP_IDS.has(id), id);
  for (const id of ['music', 'notifications', 'teleprompter', 'microphones', 'evenhub', 'glanceboard', 'developer', 'flappy']) {
    assert.ok(LEAN_HIDDEN_APP_IDS.has(id), id);
    assert.ok(ids.includes(id), `${id} stays registered`);
  }
});
