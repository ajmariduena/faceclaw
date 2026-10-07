const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

function harness(stockAvailable = false) {
  let options, painted, permitted = false, subscriptions = 0, reads = 0, renders = 0;
  const timers = new Set(), launched = [], frames = [];
  const subscribe = () => { subscriptions++; return () => subscriptions--; };
  const face = { lineHeight: 27, measureLine: s => s.length * 8, drawText() {}, hasGlyph: () => stockAvailable };
  const fallback = { lineHeight: 20, measureText: s => s.length * 10, drawText() {} };
  const load = loader({ Date,
    setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
  }, {
    '../../graphics/evenhub-font': { EvenHubFont: { get: () => face } },
    '../../graphics/ui-fonts': { getDefaultSmallFont: () => fallback },
    '../../native/calendar': { readUpcomingEvents: () => { reads++; return []; }, getCalendarReadState: () => 'ready', onCalendarChanged: subscribe },
    '../../native/calendar-permissions': { hasCalendarPermission: () => permitted },
    '../../native/media-controller': { mediaControllerBridge: { snapshot: () => ({ available: true, title: 'Canción', artist: 'Artista', playbackState: 'playing' }), onStateChange: subscribe } },
    '../../native/notification-icons': { ALL_NOTIFICATIONS: 999, onAndroidNotificationPosted: subscribe,
      readActiveNotifications: () => [{ title: 'hidden', packageName: 'blocked', postTime: 20 }, { title: 'old', packageName: 'ok', postTime: 1 }, { title: 'new', packageName: 'ok', postTime: 2 }] },
    '../../native/notification-sources': { shouldShowNotificationOnGlasses: name => name !== 'blocked' },
    '../../native/weather': { weatherBridge: { snapshot: () => ({ current: { temperatureF: 75.2 } }), onStateChange: subscribe } },
    '../../ui/shell/in-process-window': { createInProcessWindow: opts => { options = opts; return { window: {}, requestRender: () => renders++ }; } },
    '../../ui/shell/shell': { shell: { isScreenOn: () => true, getBatteryLevels: () => ({ headset: null }), onBatteryLevelsChanged: subscribe } },
    './home-painter': { paintHome: (index, data, font) => { painted = { index, data, font }; return painted; } },
  });
  const { createHomeWindow } = load('app/apps/home/home-app.ts');
  const home = createHomeWindow({ actions: {}, launchApp: async id => launched.push(id),
    submitWindowFrame: (...args) => frames.push(args), setWindowSurfaceVisible() {} });
  return { home, options, launched, timers, frames, paint: () => options.baseLayer.paint(),
    input: type => options.baseLayer.handleInput({ type }), allowCalendar: () => permitted = true,
    counts: () => ({ subscriptions, reads, renders }) };
}

test('home adapter uses real snapshots, respects notification filtering and avoids unauthorized calendar reads', () => {
  const h = harness();
  let painted = h.paint();
  assert.equal(painted.font.lineHeight, 20);
  assert.equal(painted.data.calendar.status, 'Sin permiso de calendario');
  assert.equal(h.counts().reads, 0);
  assert.equal(painted.data.temperatureC, 24);
  assert.equal(painted.data.music.title, 'Canción');
  assert.deepEqual(Array.from(painted.data.notifications, n => n.title), ['new', 'old']);
  h.allowCalendar();
  painted = h.paint();
  assert.equal(painted.data.calendar.status, 'Sin eventos hoy');
  assert.equal(h.counts().reads, 1);
  assert.equal(harness(true).paint().font.lineHeight, 27);
});

test('home window scroll/swipe/tap and direct card touch launch existing apps; return and wake differ', async () => {
  const h = harness();
  await h.input('click');
  await h.input('scroll-down');
  await h.input('click');
  await h.input('swipe-down');
  await h.input('click');
  await h.input('scroll-down');
  await h.input('click');
  await h.input('scroll-down');
  await h.options.baseLayer.hitTest(300, 100);
  assert.deepEqual(h.launched, ['calendar', 'music', 'notifications', 'microphones', 'launcher']);
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

test('home stops its polling and subscriptions while hidden or asleep and reconnects on return', () => {
  const h = harness();
  assert.equal(h.counts().subscriptions, 0);
  h.options.onForegroundChanged(true);
  assert.equal(h.counts().subscriptions, 5);
  assert.equal(h.timers.size, 1);
  h.options.onForegroundChanged(true);
  assert.equal(h.timers.size, 1);
  h.options.setScreenOn(false);
  assert.equal(h.counts().subscriptions, 0);
  assert.equal(h.timers.size, 0);
  h.options.setScreenOn(true);
  assert.equal(h.counts().subscriptions, 5);
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
  assert.equal(h.launched.at(-1), 'calendar');
});
