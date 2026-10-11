const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ key = 'test-key' } = {}) {
  const messages = [], timeouts = new Set(), holds = [], errors = [], searches = [], trips = [], calls = [];
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
    './destinations': { findSavedDestinationByName: name => name === 'Casa' ? { id: 'home', name: 'Casa', address: 'Av. 1 y Calle 2', builtin: true } : null,
      rememberRecentDestination: entry => calls.push(['remember', entry]),
      loadSavedDestinations: () => [{ id: 'home', name: 'Casa', address: 'Av. 1 y Calle 2', builtin: true }], loadRecentDestinations: () => [] },
    '../compass/calibration': { calibrateHeading: value => value + 5, normalizeHeading: value => ((value % 360) + 360) % 360 },
    '../../native/frame-timings': { startFrame: () => 1, finishFrame() {}, logFrame() {}, span: (_id, _name, fn) => fn(), runWithFrame: (_id, fn) => fn() },
    '../../native/active-display': { getActiveDisplay: () => null },
    '../../ui/window-menu': { WindowMenu: class { paint() { return []; } isOpen() { return false; } resize() {} open() {} }, WindowMenuLayer: class {} },
    '../../ui/terminal': { listScrollTop: () => 0, paintTerminalList() {}, stepSelection: (rows, selected, direction) => Math.max(0, Math.min(rows.length - 1, selected + direction)) },
    '../../graphics/plane': { planesFingerprint: () => 'frame' },
    '../../native/google-maps': {
      GOOGLE_MAPS_KEY_SETTING_KEY: 'maps.googleApiKey',
      getGoogleMapsKey: () => key,
      newSearchSession: () => 'session',
      autocompletePlaces: async input => { searches.push(input); return [{ placeId: `place:${input}`, name: `Lugar ${input}`, detail: 'Guayaquil', distanceMeters: 1200 }]; },
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
    '\nexports.probe = { handleNavigateTool, describeRouteStatus, state: () => ({ phase, statusMessage, headHeadingDeg, suggestions, query, target, rerouting }) };';
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, global, Uint8Array, Date, Math, JSON, Promise, Error, Number, String,
    setTimeout: fn => { timeouts.add(fn); return fn; }, clearTimeout: fn => timeouts.delete(fn),
    console: { log() {}, warn() {}, error: error => errors.push(error) }, require: id => modules[id] ?? {},
  });
  const send = data => global.onmessage({ data });
  send({ type: 'open-window', windowId: 'navigate:main', surfaceId: 'window:navigate:main', title: 'Navigate', viewport: { width: 576, height: 288 } });
  send({ type: 'foreground', windowId: 'navigate:main', foreground: true, focused: true });
  return { ...exports.probe, send, messages, holds, errors, tracker, searches, trips, calls,
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
  h.nav({ type: 'location', lat: -2.1, lng: -79.9, bearing: -1, speed: 0.5 });
  h.heading(90);
  assert.equal(h.state().headHeadingDeg, 107);
  h.nav({ type: 'nav', state: 'ENROUTE', stepMeters: 120, stepSeconds: 90, destMeters: 2400, destSeconds: 1800,
    step: { maneuver: 'TURN_RIGHT', road: 'Av. Joaquín Orrantia', simpleRoad: 'Orrantia', instruction: 'Gira a la derecha', roundabout: -1 } });
  assert.match(h.describeRouteStatus(), /Gira a la derecha in 120 m.*2\.4 km and 30 min left/);

  h.nav({ type: 'arrived', final: true });
  assert.equal(h.state().phase, 'arrived');
  assert.equal(h.holds.at(-1), false);
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

test('searching from the glasses: phone text debounces into suggestions, click starts the trip', async () => {
  const h = fixture();
  h.input('click');
  assert.equal(h.state().phase, 'search');
  assert.ok(h.messages.some(m => m.type === 'start-text-setting-edit'));
  h.send({ type: 'text-input', text: 'Parque Histórico' });
  assert.deepEqual(h.searches, []);
  h.runTimers();
  await flush();
  assert.deepEqual(h.searches, ['Parque Histórico']);
  assert.equal(h.state().suggestions.length, 1);
  h.input('click');
  assert.equal(h.state().phase, 'starting');
  assert.equal(h.state().target.placeId, 'place:Parque Histórico');
  assert.ok(h.messages.some(m => m.type === 'end-text-setting-edit'));
  h.input('double-click');
  assert.equal(h.messages.at(-1).type, 'yield-focus');
});

test('without a Google key the list explains what to do instead of searching', async () => {
  const h = fixture({ key: '' });
  h.input('click');
  assert.equal(h.state().phase, 'idle');
  assert.match(h.state().statusMessage, /clave de Google Maps/);
  assert.equal((await h.handleNavigateTool('start_route', { query: 'x' })).ok, false);
});
