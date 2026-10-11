const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const { loader } = require('./helpers/load-typescript.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ key = 'test-key' } = {}) {
  const messages = [], chats = [], menus = [], timeouts = new Set(), intervals = new Set(), holds = [], errors = [], searches = [], trips = [], calls = [];
  let callbacks, compass, onNavEvent = null;
  const tracker = { running: false, isRunning() { return this.running; }, start() { this.running = true; }, stop() { this.running = false; } };
  const sensor = { LocationTracker: function (value) { callbacks = value; return tracker; }, COMPASS_CHANGED: 15,
    addCompassListener: fn => { compass = fn; return () => { compass = null; }; },
    setCompassEnabled: value => holds.push(value), magneticDeclinationDegrees: () => 12,
    handleNavigationSensorEvent: event => { if (event.kind === 'location') callbacks.onLocation(event.location); } };
  const setting = value => ({ value, id: 'x', label: 'x', get() { return this.value; }, set(next) { this.value = next; return next; }, toggle() { this.value = !this.value; return this.value; }, displayValue: v => String(v ?? value) });
  const modules = {
    '@nativescript/core/globals': {},
    '../../ui/shell/worker-lifecycle': { finishWorkerShutdown() {} },
    '../../graphics/ui-fonts': { getDefaultSmallFont: () => ({}) },
    '../../graphics/installed-fonts': { ensurePreinstalledFonts() {}, installedFontPath: name => name },
    '../../native/settings-store': { onSettingsStoreChanged() {} },
    '../../ui/dashboard-settings': {
      enumSettingMenuItem: () => ({}),
      navigateTravelModeSetting: setting('driving'),
      navigateSearchDraftSetting: setting(''),
      navigateDestinationNameDraftSetting: setting(''),
      navigateDestinationAddressDraftSetting: setting(''),
      navigateRememberRecentSetting: setting(true),
      navigateDisplayModeSetting: setting('auto'),
      navigateVerticalPositionSetting: setting('middle'),
    },
    './navigation-sensors': sensor,
    './heading-model': loader({ Math, Number, Object })('app/apps/navigate/heading-model.ts'),
    './destinations': { findSavedDestinationByName: name => name === 'Casa' ? { id: 'home', name: 'Casa', address: 'Av. 1 y Calle 2', builtin: true } : null,
      rememberRecentDestination: entry => calls.push(['remember', entry]),
      loadSavedDestinations: () => [{ id: 'home', name: 'Casa', address: 'Av. 1 y Calle 2', builtin: true }], loadRecentDestinations: () => [] },
    '../compass/calibration': { calibrateHeading: value => value + 5, normalizeHeading: value => ((value % 360) + 360) % 360 },
    '../../native/frame-timings': { startFrame: () => 1, finishFrame() {}, logFrame() {}, span: (_id, _name, fn) => fn(), runWithFrame: (_id, fn) => fn() },
    '../../native/active-display': { getActiveDisplay: () => null },
    '../../ui/window-menu': { WindowMenu: class { constructor(options) { menus.push(options); } paint() { return []; } isOpen() { return false; } resize() {} open() { calls.push(['menu']); } }, WindowMenuLayer: class {} },
    '../../graphics/image': { GrayImage: class {} },
    '../../graphics/ttf-font': { TtfFont: { load: () => ({}) } },
    '../../ui/terminal-face': { terminalFace: () => ({}) },
    './nav-render': { paintGuidance() {}, formatDistance: meters => [String(meters), 'm'] },
    '../../ui/terminal': { listScrollTop: () => 0, paintTerminalList() {}, stepSelection: (rows, selected, direction) => { for (let i = selected + direction; i >= 0 && i < rows.length; i += direction) if (rows[i].selectable !== false) return i; return selected; } },
    '../../graphics/plane': { planesFingerprint: () => 'frame' },
    '../../graphics/terminal-painter': { fitLine: (_face, text) => text, paintChat: (_image, _face, view) => chats.push(view) },
    '../../ui/chat-draft': loader({ Math })('app/ui/chat-draft.ts'),
    '../../native/google-maps': {
      GOOGLE_MAPS_KEY_SETTING_KEY: 'maps.googleApiKey',
      getGoogleMapsKey: () => key,
      newSearchSession: () => 'session',
      autocompletePlaces: async input => { searches.push(input); return [{ placeId: `place:${input}`, name: `Lugar ${input}`, detail: 'Guayaquil', distanceMeters: 1200 }]; },
      nearbyPlaces: async type => { searches.push(`nearby:${type}`); return [{ placeId: `near:${type}`, name: 'Farmacia Cruz Azul', detail: 'Av. 9 de Octubre', distanceMeters: 300 }]; },
      RoadTiles: class { tile() { return null; } clear() {} },
      worldPixel: (lat, lng, zoom) => [lng * 2 ** zoom, -lat * 2 ** zoom],
    },
    '../../native/google-navigation': {
      GoogleNavigation: class {
        start(_key, onEvent) { onNavEvent = onEvent; calls.push(['start']); }
        navigateTo(target, mode) { trips.push({ ...target, mode }); }
        stop() { calls.push(['stop']); }
        detach() { calls.push(['detach']); onNavEvent = null; }
      },
    },
  };
  const global = { postMessage: message => messages.push(message) };
  const source = fs.readFileSync(path.join(__dirname, '../app/apps/navigate/navigate-app.worker.ts'), 'utf8') +
    '\nexports.probe = { handleNavigateTool, describeRouteStatus, headingNow: () => heading.output(Date.now()), state: () => ({ phase, statusMessage, suggestions, query, target, rerouting, voice, review, searchMessage: searchMessage() }) };';
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, global, Uint8Array, Date, Math, JSON, Promise, Error, Number, String,
    setTimeout: fn => { timeouts.add(fn); return fn; }, clearTimeout: fn => timeouts.delete(fn),
    setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn),
    console: { log() {}, warn() {}, error: error => errors.push(error) }, require: id => modules[id] ?? {},
  });
  const send = data => global.onmessage({ data });
  send({ type: 'open-window', windowId: 'navigate:main', surfaceId: 'window:navigate:main', title: 'Navigate', viewport: { width: 576, height: 288 } });
  send({ type: 'foreground', windowId: 'navigate:main', foreground: true, focused: true });
  return { ...exports.probe, send, messages, intervals,
    view: () => { menus.at(-1).paintBase(); return chats.at(-1); }, holds, errors, tracker, searches, trips, calls,
    nav: event => onNavEvent?.(event),
    input: type => send({ type: 'input', windowId: 'navigate:main', focused: true, frameId: 1, event: { type } }),
    runTimers: () => { const pending = [...timeouts]; timeouts.clear(); for (const callback of pending) callback(); },
    heading: value => compass?.({ command: 15, headingDegrees: value }) };
}

test('start_route searches Google, guides with calibrated true heading and returns home after arrival', async () => {
  const h = fixture();
  const call = h.handleNavigateTool('start_route', { query: 'Mall del Sol', profile: 'walking' });
  await flush();
  assert.deepEqual(h.searches, ['Mall del Sol']);
  assert.equal(h.state().phase, 'starting');
  assert.equal(h.tracker.running, false);
  h.nav({ type: 'ready' });
  assert.deepEqual(h.trips.map(t => [t.placeId, t.mode]), [['place:Mall del Sol', 'walking']]);
  h.nav({ type: 'status', status: 'OK' });
  assert.deepEqual({ ...(await call) }, { ok: true, content: 'Navigating to Lugar Mall del Sol (Guayaquil) by walking.' });
  assert.equal(h.state().phase, 'guiding');
  assert.equal(h.holds.at(-1), true);

  h.nav({ type: 'route', points: [[-2.1, -79.9], [-2.2, -79.8]] });
  assert.equal(h.calls.find(c => c[0] === 'remember')[1].placeId, 'place:Mall del Sol');
  h.nav({ type: 'location', lat: -2.1, lng: -79.9, bearing: -1, speed: 0.5, accuracy: 5, bearingAccuracy: -1 });
  h.heading(90);
  assert.deepEqual({ ...h.headingNow() }, { bearingDeg: 107, source: 'head', showChevron: true, compassPoor: false });
  assert.equal(h.intervals.size, 1);
  h.nav({ type: 'nav', state: 'ENROUTE', stepMeters: 120, stepSeconds: 90, destMeters: 2400, destSeconds: 1800,
    step: { maneuver: 'TURN_RIGHT', road: 'Av. Joaquín Orrantia', simpleRoad: 'Orrantia', instruction: 'Gira a la derecha', roundabout: -1 } });
  assert.match(h.describeRouteStatus(), /Gira a la derecha in 120 m.*2\.4 km and 30 min left/);

  h.nav({ type: 'arrived', final: true });
  assert.equal(h.state().phase, 'arrived');
  assert.equal(h.holds.at(-1), false);
  assert.equal(h.intervals.size, 0);
  assert.ok(h.calls.some(c => c[0] === 'stop'));
  h.runTimers();
  assert.equal(h.state().phase, 'idle');
  assert.equal(h.tracker.running, true);
  assert.deepEqual(h.errors, []);
});

test('saved destinations route through their address and are not added to recents', async () => {
  const h = fixture();
  const call = h.handleNavigateTool('start_route', { query: 'home' });
  await flush();
  assert.deepEqual(h.searches, ['Av. 1 y Calle 2']);
  h.nav({ type: 'ready' });
  assert.equal(h.trips[0].mode, 'driving');
  h.nav({ type: 'status', status: 'OK' });
  assert.equal(h.holds.includes(true), false, 'no compass while driving');
  assert.equal(h.intervals.size, 1);
  assert.match((await call).content, /Navigating to Casa/);
  h.nav({ type: 'route', points: [[-2.1, -79.9], [-2.2, -79.8]] });
  assert.equal(h.calls.some(c => c[0] === 'remember'), false);
});

test('a failed route returns to the list with a Spanish message and fails the tool call', async () => {
  const h = fixture();
  const call = h.handleNavigateTool('start_route', { query: 'Nowhere' });
  await flush();
  h.nav({ type: 'ready' });
  h.nav({ type: 'status', status: 'NO_ROUTE_FOUND' });
  assert.deepEqual({ ...(await call) }, { ok: false, error: 'No encontré una ruta.' });
  assert.equal(h.state().phase, 'idle');
  assert.equal(h.state().statusMessage, 'No encontré una ruta.');
});

test('closing the window mid-route stops guidance and ignores late Google events', async () => {
  const h = fixture();
  const call = h.handleNavigateTool('start_route', { query: 'Malecón' });
  await flush();
  h.send({ type: 'close-window', windowId: 'navigate:main' });
  assert.equal((await call).ok, false);
  assert.ok(h.calls.some(c => c[0] === 'detach'));
  h.nav({ type: 'status', status: 'OK' });
  assert.equal(h.state().phase, 'idle');
  assert.equal(h.tracker.running, false);
  assert.equal(h.holds.includes(true), false);
});

const voiceDrafts = h => h.messages.filter(m => m.type === 'voice-draft').map(m => m.action);
const voiceState = (h, state) => h.send({ type: 'voice-draft', windowId: 'navigate:main', text: '', status: '', ...state });

test('searching from the glasses: tap dictates, tap stops, Send searches and a tap starts the trip', async () => {
  const h = fixture();
  h.input('click');
  assert.equal(h.state().phase, 'search');
  assert.deepEqual(voiceDrafts(h), ['start']);
  assert.equal(h.messages.some(m => m.type === 'start-text-setting-edit'), false);
  voiceState(h, { phase: 'listening', text: 'Parque' });
  assert.equal(h.view().lines[0].text, 'Parque');
  assert.equal(h.view().footer.left, '· Listening');
  h.input('click');
  assert.deepEqual(voiceDrafts(h), ['start', 'release']);
  voiceState(h, { phase: 'idle', final: 'Parque Histórico' });
  assert.equal(h.state().voice, null);
  assert.equal(h.view().permission.question, 'Draft');
  assert.deepEqual([...h.view().permission.options], ['Send', 'Edit', 'Discard']);
  h.input('click');
  assert.deepEqual(h.searches, []);
  h.runTimers();
  await flush();
  assert.deepEqual(h.searches, ['Parque Histórico']);
  assert.equal(h.state().suggestions.length, 1);
  h.input('click');
  assert.equal(h.state().phase, 'starting');
  assert.equal(h.state().target.placeId, 'place:Parque Histórico');
  h.input('double-click');
  assert.equal(h.messages.at(-1).type, 'yield-focus');
});

test('a dictated destination can be edited on the phone or discarded back to the list', () => {
  const h = fixture();
  h.input('click');
  voiceState(h, { phase: 'idle', final: 'Malecon' });
  h.input('scroll-down');
  h.input('click');
  const edit = h.messages.find(m => m.type === 'start-text-setting-edit');
  assert.ok(edit);
  assert.equal(h.state().review.editing, true);
  assert.equal(h.view().permission.question, 'Edit on phone');
  h.input('scroll-down');
  h.input('click');
  assert.equal(h.state().phase, 'idle');
  assert.equal(h.messages.at(-1).type, 'end-text-setting-edit');
});

test('dictation that hears nothing, or is cancelled, never searches', () => {
  const h = fixture();
  h.input('click');
  voiceState(h, { phase: 'idle', status: 'No speech detected' });
  assert.equal(h.state().phase, 'search');
  assert.match(h.state().searchMessage, /No speech detected/);
  h.input('click');
  assert.deepEqual(voiceDrafts(h), ['start', 'start']);
  h.input('double-click');
  assert.deepEqual(voiceDrafts(h), ['start', 'start', 'cancel']);
  assert.equal(h.state().phase, 'idle');
  voiceState(h, { phase: 'idle', final: 'late' });
  assert.equal(h.state().review.active, false);
  assert.deepEqual(h.searches, []);
});

test('without a Google key the list explains what to do instead of searching', async () => {
  const h = fixture({ key: '' });
  h.input('click');
  assert.equal(h.state().phase, 'idle');
  assert.match(h.state().statusMessage, /clave de Google Maps/);
  assert.equal((await h.handleNavigateTool('start_route', { query: 'x' })).ok, false);
});

test('home lists dictation, saved places and nearby shortcuts; a shortcut searches nearest first', async () => {
  const h = fixture();
  h.send({ type: 'navigation-sensors', windowId: 'navigate:main', event: { kind: 'location', location: { latitude: -2.17, longitude: -79.92, accuracy: 5 } } });
  for (let i = 0; i < 3; i++) h.input('scroll-down');
  h.input('click');
  assert.equal(h.state().phase, 'search');
  await flush();
  assert.deepEqual(h.searches, ['nearby:pharmacy']);
  assert.equal(h.state().suggestions[0].placeId, 'near:pharmacy');
  assert.equal(h.messages.some(m => m.type === 'voice-draft'), false);
  h.input('click');
  assert.equal(h.state().target.placeId, 'near:pharmacy');
});

test('a tap during guidance opens the menu where the route can be stopped', async () => {
  const h = fixture();
  h.handleNavigateTool('start_route', { query: 'Malecón' });
  await flush();
  h.nav({ type: 'ready' });
  h.nav({ type: 'status', status: 'OK' });
  h.input('click');
  assert.ok(h.calls.some(c => c[0] === 'menu'));
  assert.equal(h.state().phase, 'guiding');
});
