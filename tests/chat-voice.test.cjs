const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, deps, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, console, setTimeout, clearTimeout, ...globals, require(name) {
    assert.ok(name in deps, `Unexpected import ${name} in ${file}`);
    return deps[name];
  } });
  return exports;
}
function draftEnv({ prepare = async () => true, start = async () => {}, stop = () => {}, initialStatus = 'Ready' } = {}) {
  const transcripts = new Set(), statuses = new Set(), timers = new Map();
  const sent = [];
  let starts = 0, stops = 0, mic = false, timerId = 0;
  const { VoiceDraft } = load('app/ui/voice-draft.ts', {
    '../native/voice-control': { voiceControlBridge: {
      onTranscript(cb) { transcripts.add(cb); return () => transcripts.delete(cb); },
      onStatus(cb) { statuses.add(cb); cb({ status: initialStatus }); return () => statuses.delete(cb); },
    } },
    './shell/voice-activity': { voiceActivity: { setActive(value) { mic = value; } } },
  }, {
    setTimeout(cb) { timers.set(++timerId, cb); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  const draft = new VoiceDraft({ startVoiceCapture: async () => { starts++; await start(); }, stopVoiceCapture: () => { stops++; return stop(); } }, prepare, () => {}, (text) => sent.push(text));
  return { draft, sent, starts: () => starts, stops: () => stops, mic: () => mic,
    transcript(text, isFinal = false) { for (const cb of [...transcripts]) cb({ text, isFinal }); },
    status(status) { for (const cb of [...statuses]) cb({ status }); },
    timeout() { for (const cb of [...timers.values()]) cb(); },
    subscriptions: () => transcripts.size + statuses.size,
  };
}

test('hold displays partials, release waits for final and sends exactly once', async () => {
  const env = draftEnv();
  await env.draft.start();
  env.transcript('hello');
  assert.equal(env.draft.text, 'hello');
  assert.deepEqual(env.sent, []);
  env.draft.release();
  assert.equal(env.stops(), 1);
  env.transcript('hello world', true);
  env.timeout();
  env.transcript('duplicate', true);
  assert.deepEqual(env.sent, ['hello world']);
  assert.equal(env.subscriptions(), 0);
  assert.equal(env.mic(), false);
});

test('release before permission resolves never starts a microphone', async () => {
  let ready;
  const env = draftEnv({ prepare: () => new Promise((resolve) => { ready = resolve; }) });
  const start = env.draft.start();
  env.draft.release(); ready(true); await start;
  assert.equal(env.starts(), 0);
  assert.equal(env.draft.active, false);
  assert.deepEqual(env.sent, []);
});

test('chat waits past its fallback deadline for native recognition', async () => {
  let complete;
  const stopped = new Promise(resolve => { complete = resolve; });
  const env = draftEnv({ stop: () => stopped });
  await env.draft.start();
  env.transcript('first segment');
  env.draft.release(); env.timeout();
  assert.deepEqual(env.sent, []);
  assert.equal(env.draft.phase, 'finishing');
  env.transcript('first segment and the rest', true);
  complete(); await stopped; env.timeout();
  assert.deepEqual(env.sent, ['first segment and the rest']);
});

test('a cancelled chat capture cannot finish a newer capture when native stop resolves', async () => {
  let complete;
  const stopped = new Promise(resolve => { complete = resolve; });
  const env = draftEnv({ stop: () => stopped });
  await env.draft.start();
  env.draft.release(); env.draft.cancel();
  await env.draft.start();
  env.transcript('new speech');
  complete(); await stopped; env.timeout();
  assert.deepEqual(env.sent, []);
  assert.equal(env.draft.phase, 'listening');
  env.draft.cancel();
});

test('release during async mic startup stops capture after it starts', async () => {
  let started;
  const env = draftEnv({ start: () => new Promise((resolve) => { started = resolve; }) });
  const pending = env.draft.start();
  await new Promise(setImmediate);
  env.transcript('quick message');
  env.draft.release(); started(); await pending;
  assert.equal(env.stops(), 1);
  env.timeout();
  assert.deepEqual(env.sent, ['quick message']);
});

test('empty capture, rejection and closing never submit stale speech', async () => {
  for (const cancel of ['empty', 'rejection', 'close']) {
    const env = draftEnv({ initialStatus: 'old error' });
    await env.draft.start();
    assert.equal(env.starts(), 1);
    if (cancel !== 'empty') env.transcript('should not send');
    if (cancel === 'rejection') env.status('Ignored — not your enrolled voice');
    if (cancel === 'close') env.draft.cancel();
    env.draft.release(); env.timeout(); env.transcript('late', true);
    assert.deepEqual(env.sent, []);
    assert.equal(env.subscriptions(), 0);
  }
});

function shellEnv({ wakeAction = 'voice-input' } = {}) {
  const gestures = load('app/ui/gestures.ts', {});
  class Image { constructor(width = 576, height = 260) { this.width = width; this.height = height; } }
  const images = { GrayImage: Image, G2_LENS_WIDTH: 640, G2_LENS_HEIGHT: 480 };
  const timings = { spanCurrent: (_, fn) => fn(), span: (_, __, fn) => fn(), spanAsync: (_, __, fn) => fn(),
    startFrame: () => 0, annotateFrame() {}, finishFrame() {}, runWithFrame: (_, fn) => fn() };
  const layers = load('app/ui/layers.ts', {
    '../graphics/image': images, '../graphics/plane': { dimPlanes: (planes) => planes },
    '../native/frame-timings': timings, './gestures': gestures,
  });
  class Menu {
    constructor(title, items) { this.title = title; this.items = items; this.selectedIndex = 0; }
    selectItem(index) { this.selectedIndex = index; return this; }
    paint(_ctx, below) { return below(); }
    handleInput(event, ctx) { if (event.type === 'double-click') ctx.stack.pop(); }
  }
  const voiceDialogs = [];
  const settings = { wakeWordActionSetting: { get: () => wakeAction }, brightnessSetting: { get: () => 'auto' } };
  const { shell, rawInputEventToInputEvent } = load('app/ui/shell/shell.ts', {
    '../../graphics/shell-scene': { encodeShellScene: () => new Uint8Array([0, 0]) },
    '../../graphics/image': images, '../../graphics/plane': {}, '../../graphics/ui-fonts': {}, '../../g2/events': load('app/g2/events.ts', {}),
    '../gestures': gestures, '../layers': layers, '../menu': { MenuLayer: Menu },
    '../input-monitor': load('app/ui/input-monitor.ts', {}),
    './voice-input': { VoiceInputLayer: class {
      constructor(options) { this.options = options; voiceDialogs.push(options); }
      startCapture() {}
      onRemoved() { this.options.onClosed(); }
    } }, './keyboard-input': {}, './voice-activity': { voiceActivity: { setActive() {} } },
    '../notifications': {}, '../dashboard-settings': settings, './ambient-cards': {},
    './chrome-layer': { ShellChromeLayer: class {} }, './modal-layer': {}, './tool-debug-layer': {},
    './brightness-picker-layer': {}, './window-alert-layer': { WindowAlertLayer: class {} }, './notification-modal-queue': load('app/ui/shell/notification-modal-queue.ts', {}),
    '../../native/notification-icons': {}, '../../native/notification-sources': {},
    '../../assistant/tool-registry': {}, '../../lean': { LEAN_NOTIFICATION_POPUPS: false }, './geometry': {
      sidebarWidth: () => 64, minWindowTop: () => 96, switcherPosition: () => 'left', uiDepth: () => 0,
      appViewportRect: () => ({ x: 64, y: 124, width: 576, height: 260 }),
    },
  });
  const { createInProcessWindow } = load('app/ui/shell/in-process-window.ts', {
    '../../graphics/image': images, '../../native/frame-timings': timings,
    '../../util/render-freshness': { beginRenderPass() {}, endRenderPass: () => false },
    '../layers': layers, '../window-menu': { WindowMenuLayer: Menu },
    './chrome-layer': { windowIcon: () => () => null }, './geometry': { appViewportSize: () => ({ width: 576, height: 260 }) },
    './shell': { shell },
  });
  const input = [], menus = [];
  let microphone = false;
  const app = createInProcessWindow({
    appId: 'bots', windowId: 'bots', title: 'Grok Bot', iconLetter: 'G', closeable: true, holdToTalk: true,
    baseLayer: { paint: () => new Image(), handleInput(event) {
      input.push(event.type);
      if (event.type === 'long-press') microphone = true;
      if (event.type === 'long-press-release') microphone = false;
      if (event.type === 'double-click') shell.yieldFocusToSidebar();
    } },
    menuItems: () => [{ label: 'Stop', onSelect() {} }],
    onAppMenuOpened() { menus.push('app'); microphone = false; },
    onSystemMenuOpened() { menus.push('system'); microphone = false; },
    isVoiceCapturing: () => microphone,
    actions: layers.noopLayerActions, submitFrame: async () => {}, setSurfaceVisible() {},
  });
  shell.registerWindow(app.window);
  shell.focusWindow('bots');
  return { shell, app, input, menus, voiceDialogs, rawInputEventToInputEvent, microphone: () => microphone, event: (type) => gestures.makeInputEvent({ type }) };
}

test('wakeword wakes the shared shell, respects its action, and opens only one hands-free Grok Bot dialog', async () => {
  for (const wakeAction of ['off', 'turn-screen-on', 'voice-input']) {
    const env = shellEnv({ wakeAction });
    const sent = [];
    env.shell.config.botsReady = () => true;
    env.shell.config.sendToBots = (text) => sent.push(text);
    env.shell.sleep();
    const event = env.rawInputEventToInputEvent({ kind: 'even-ai', eventType: 1, eventSource: 0 });
    assert.equal(event.type, 'wakeword');
    await env.shell.receiveInput(event);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(env.shell.isScreenOn(), wakeAction !== 'off');
    assert.equal(env.voiceDialogs.length, wakeAction === 'voice-input' ? 1 : 0);
    if (wakeAction === 'voice-input') {
      const options = env.voiceDialogs[0];
      assert.equal(options.handsFree, true);
      const target = options.sendTargets[options.defaultTargetIndex];
      assert.deepEqual([target.id, target.label], ['bots', 'Send to Grok Bot']);
      target.onSend('hola');
      assert.deepEqual(sent, ['hola']);
      await env.shell.receiveInput(event);
      assert.equal(env.voiceDialogs.length, 1);
    }
    env.shell.stack.clearToBase();
  }
});

test('chat holds bypass the escape timer; release, menus and double tap follow the requested routing', async () => {
  const env = shellEnv();
  await env.shell.receiveInput(env.event('long-press'));
  assert.equal(env.microphone(), true);
  assert.equal(env.shell.escapeMenuTimer, null);
  await env.shell.receiveInput(env.event('long-press-release'));
  assert.equal(env.microphone(), false);
  assert.deepEqual(env.input, ['long-press', 'long-press-release']);
  await env.shell.receiveInput(env.event('click'));
  assert.deepEqual(env.menus, ['app']);
  assert.equal(env.app.stack.isAtBase(), false);
  await env.shell.receiveInput(env.event('short-then-long-press'));
  assert.deepEqual(env.menus, ['app', 'system']);
  assert.equal(env.app.stack.isAtBase(), true);
  assert.equal(env.shell.stack.isAtBase(), false);
  await env.shell.receiveInput(env.event('long-press-release'));
  assert.deepEqual(env.input, ['long-press', 'long-press-release']);
  env.shell.stack.clearToBase();
  env.shell.focusWindow('bots');
  await env.shell.receiveInput(env.event('double-click'));
  assert.equal(env.shell.isWindowFocused('bots'), false);
});

test('ordinary apps retain long-press system menu and games retain the escape timer', async () => {
  const env = shellEnv();
  env.app.window.holdToTalk = false;
  await env.shell.receiveInput(env.event('long-press'));
  assert.deepEqual(env.menus, ['system']);
  assert.deepEqual(env.input, []);
  env.shell.stack.clearToBase();
  env.app.window.claimsLongPress = () => true;
  await env.shell.receiveInput(env.event('long-press'));
  assert.notEqual(env.shell.escapeMenuTimer, null);
  await env.shell.receiveInput(env.event('long-press-release'));
  assert.equal(env.shell.escapeMenuTimer, null);
});
