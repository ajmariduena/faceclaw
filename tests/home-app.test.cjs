const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

function harness(stockAvailable = false) {
  let options, painted, permitted = false, subscriptions = 0, reads = 0, renders = 0, paseoState, sonioxKey = '', sleeps = 0;
  let nowMs = new Date(2026, 9, 10, 10, 5).getTime(), events = [], foreground = 'home', locationPermitted = false;
  let battery = { headset: null, headsetCharging: null, ring: null, ringCharging: null, watch: null, watchCharging: null };
  const timers = new Set(), launched = [], frames = [], periods = [], fetched = [], stored = new Map();
  const weatherBody = { current: { time: '2026-10-10T10:00', interval: 900, temperature_2m: 30.3, weather_code: 3, is_day: 1 } };
  class ClockDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(nowMs); }
    static now() { return nowMs; }
  }
  const subscribe = () => { subscriptions++; return () => subscriptions--; };
  const face = { lineHeight: 27, measureLine: s => s.length * 8, drawText() {}, hasGlyph: () => stockAvailable };
  const fallback = { lineHeight: 20, measureText: s => s.length * 10, drawText() {} };
  const load = loader({ Date: ClockDate, setTimeout, clearTimeout,
    setInterval: (fn, ms) => { periods.push(ms); timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
  }, {
    '@nativescript/core': { knownFolders: {} },
    '../graphics/evenhub-font': { EvenHubFont: { get: () => face } },
    '../graphics/ui-fonts': { getDefaultSmallFont: () => fallback },
    '../../native/calendar': { readUpcomingEvents: () => { reads++; return events; }, getCalendarReadState: () => 'ready', onCalendarChanged: subscribe },
    '../../native/calendar-permissions': { hasCalendarPermission: () => permitted },
    '../../native/location': { getCurrentLocation: async () => ({ latitude: -2.17, longitude: -79.92, accuracyMeters: null, timestampMs: nowMs }) },
    '../../native/location-permissions': { hasLocationPermission: () => locationPermitted },
    '../../native/settings-store': { getStringSetting: (key, fallback) => stored.get(key) ?? fallback, setStringSetting: (key, value) => stored.set(key, value) },
    '../../util/http': { fetchTextWithUserAgent: async url => { fetched.push(url); return { ok: true, status: 200, json: async () => weatherBody }; } },
    '../../ui/dashboard-settings': { onAnySettingChanged: subscribe, sonioxApiKeySetting: { get: () => sonioxKey } },
    '../../ui/shell/in-process-window': { createInProcessWindow: opts => { options = opts; return { window: { windowId: 'home' }, requestRender: () => renders++ }; } },
    '../../ui/shell/shell': { shell: { isScreenOn: () => true, sleep: () => sleeps++, foregroundWindow: () => ({ windowId: foreground }),
      getBatteryLevels: () => battery, onBatteryLevelsChanged: subscribe } },
    '../../ui/shell/worker-state': { readWorkerState: () => paseoState, onWorkerStateChanged: subscribe },
    './home-painter': { paintHome: (index, data, font) => { painted = { index, data, font }; return painted; } },
  });
  const { createHomeWindow } = load('app/apps/home/home-app.ts');
  const home = createHomeWindow({ actions: {}, launchApp: async id => { launched.push(id); if (id !== 'translate') foreground = id; },
    submitWindowFrame: (...args) => frames.push(args), setWindowSurfaceVisible() {} });
  return { home, options, launched, timers, frames, periods, fetched, stored, setEvents: value => events = value, setPaseo: value => paseoState = value,
    setSonioxKey: value => sonioxKey = value, setForeground: id => foreground = id, allowLocation: () => locationPermitted = true,
    setBattery: value => battery = { ...battery, ...value },
    advance: ms => { nowMs += ms; for (const fn of timers) fn(); }, paint: () => options.baseLayer.paint(),
    input: type => options.baseLayer.handleInput({ type }), allowCalendar: () => permitted = true,
    counts: () => ({ subscriptions, reads, renders, sleeps }) };
}

test('home adapter uses real snapshots, English chrome, and avoids unauthorized calendar reads', () => {
  const h = harness();
  let painted = h.paint();
  assert.equal(painted.font.lineHeight, 20);
  assert.equal(painted.data.calendar.status, 'No calendar access');
  assert.equal(h.counts().reads, 0);
  assert.equal('music' in painted.data, false);
  assert.equal('notifications' in painted.data, false);
  assert.equal(painted.data.translateReady, false);
  assert.deepEqual({ ...painted.data.battery }, { ring: null, glasses: null });
  assert.equal(painted.data.weather, null);
  assert.equal(h.options.title, 'Home');
  h.allowCalendar();
  h.setSonioxKey(' sk-soniox ');
  painted = h.paint();
  assert.equal(painted.data.calendar.status, 'Nothing today');
  assert.equal(painted.data.translateReady, true);
  assert.equal(h.counts().reads, 1);
  assert.equal(harness(true).paint().font.lineHeight, 27);
});

test('home window scroll/swipe/tap and direct card touch launch the five apps; return and wake differ', async () => {
  const h = harness();
  await h.input('click');
  h.home.onShow(false);
  await h.input('scroll-down');
  await h.input('click');
  h.home.onShow(false);
  await h.input('swipe-down');
  await h.input('click');
  await h.input('scroll-down');
  await h.input('click');
  h.home.onShow(false);
  await h.input('scroll-down');
  await h.options.baseLayer.hitTest(300, 100);
  assert.deepEqual(h.launched, ['paseo', 'calendar', 'translate', 'converse', 'launcher']);
  h.home.onShow(false);
  assert.equal(h.paint().index, 4);
  h.home.onShow(true);
  assert.equal(h.paint().index, 0);
  await h.input('swipe-up');
  assert.equal(h.paint().index, 4);
  await h.input('scroll-up');
  assert.equal(h.paint().index, 3);
  await h.options.baseLayer.hitTest(10, 10);
  assert.equal(h.launched.length, 5);
});

test('a card whose app is missing from the build leaves the home in place without crashing', async () => {
  const h = harness();
  await h.input('scroll-down');
  await h.input('scroll-down');
  await h.input('click');
  assert.deepEqual(h.launched, ['translate']);
  await h.input('scroll-down');
  assert.equal(h.paint().index, 3);
});

test('double tap on home turns the screen off, except within 700 ms of arriving home', async () => {
  const h = harness();
  h.home.onShow(false);
  await h.input('double-click');
  assert.equal(h.counts().sleeps, 0);
  h.advance(699);
  await h.input('double-click');
  assert.equal(h.counts().sleeps, 0);
  h.advance(1);
  await h.input('double-click');
  assert.equal(h.counts().sleeps, 1);
  h.home.onShow(true);
  await h.input('double-click');
  assert.equal(h.counts().sleeps, 1);
  h.advance(700);
  await h.input('double-click');
  assert.equal(h.counts().sleeps, 2);
});

test('home stops its polling and subscriptions while hidden or asleep and reconnects on return', () => {
  const h = harness();
  assert.equal(h.counts().subscriptions, 0);
  h.options.onForegroundChanged(true);
  assert.equal(h.counts().subscriptions, 4);
  assert.equal(h.timers.size, 1);
  h.options.onForegroundChanged(true);
  assert.equal(h.timers.size, 1);
  h.options.setScreenOn(false);
  assert.equal(h.counts().subscriptions, 0);
  assert.equal(h.timers.size, 0);
  h.options.setScreenOn(true);
  assert.equal(h.counts().subscriptions, 4);
  h.options.onForegroundChanged(false);
  assert.equal(h.counts().subscriptions, 0);
  h.options.onForegroundChanged(true);
  h.options.onClosed();
  assert.equal(h.counts().subscriptions, 0);
  assert.equal(h.timers.size, 0);
});

test('Watch horizontal swipes paginate circularly without changing Ring or vertical mappings', async () => {
  const h = harness();
  for (let index = 1; index <= 5; index++) {
    await h.input('swipe-left');
    assert.equal(h.paint().index, index % 5);
  }
  await h.input('swipe-right');
  assert.equal(h.paint().index, 4);
  await h.input('scroll-down');
  assert.equal(h.paint().index, 0);
  await h.input('scroll-up');
  assert.equal(h.paint().index, 4);
  await h.input('swipe-down');
  assert.equal(h.paint().index, 0);
  await h.input('swipe-up');
  assert.equal(h.paint().index, 4);
  await h.input('swipe-left');
  await h.input('click');
  assert.equal(h.launched.at(-1), 'paseo');
});

test('the visible timer re-reads the calendar and the column mirrors the shell batteries', () => {
  const h = harness();
  h.allowCalendar();
  h.setEvents([{ title: 'Daily', startMs: new Date(2026, 9, 10, 10, 30).getTime(), endMs: new Date(2026, 9, 10, 11).getTime() }]);
  h.setBattery({ headset: 88, ring: 72 });
  h.options.onForegroundChanged(true);
  let painted = h.paint();
  assert.equal(h.counts().reads, 1);
  assert.equal(painted.data.calendar.events[0].title, 'Daily');
  assert.deepEqual({ ...painted.data.battery }, { ring: 72, glasses: 88 });
  h.advance(60_000);
  assert.equal(h.counts().renders, 1);
  painted = h.paint();
  assert.equal(h.counts().reads, 2);
  assert.equal(painted.data.now.getTime(), new Date(2026, 9, 10, 10, 6).getTime());
  assert.deepEqual(h.periods, [30_000]);
  h.options.setScreenOn(false);
  h.advance(60_000);
  assert.equal(h.counts().renders, 1);
});

test('weather is fetched from Open-Meteo only with location permission, at most every 30 minutes, and cached', async () => {
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const h = harness();
  h.options.onForegroundChanged(true);
  h.advance(30_000);
  await flush();
  assert.deepEqual(h.fetched, []);
  assert.equal(h.paint().data.weather, null);
  h.allowLocation();
  h.advance(30_000);
  await flush(); await flush();
  assert.equal(h.fetched.length, 1);
  assert.match(h.fetched[0], /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=-2\.1700&longitude=-79\.9200&current=temperature_2m,weather_code,is_day$/);
  assert.equal(h.counts().renders, 3, 'the reading repaints the home');
  assert.deepEqual({ ...h.paint().data.weather }, { temperatureC: 30.3, code: 3, isDay: true, atMs: new Date(2026, 9, 10, 10, 6).getTime() });
  h.advance(29 * 60_000);
  await flush();
  assert.equal(h.fetched.length, 1);
  h.advance(60_000);
  await flush(); await flush();
  assert.equal(h.fetched.length, 2);
  assert.ok(h.stored.has('home.weather'));
});

test('the Paseo card paints what the worker last published and repaints on its updates', () => {
  const h = harness();
  assert.equal(h.paint().data.paseo, null);
  h.setPaseo({ configured: true, status: '', updates: [{ agentId: 'a', title: 'Fix', bucket: 'done', activityMs: 1, line: 'Listo.' }], needs: 0, working: 0 });
  assert.equal(h.paint().data.paseo.updates[0].line, 'Listo.');
  h.options.onForegroundChanged(true);
  assert.equal(h.counts().subscriptions, 4);
});
