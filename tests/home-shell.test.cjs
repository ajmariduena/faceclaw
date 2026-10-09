const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { loader } = require('./helpers/load-typescript.cjs');
const { HomeModel } = loader()('app/apps/home/home-model.ts');

function harness() {
  const source = ts.createSourceFile('shell.ts', fs.readFileSync('app/ui/shell/shell.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const klass = source.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'Shell');
  const names = ['registerWindow', 'registerHomeWindow', 'showHome', 'focusWindow', 'wake', 'sleep', 'routeInput',
    'receiveInput', 'isFocusTarget', 'inputTargetWindow', 'syncInputFocus', 'setSelectedIndex', 'noteWindowVisible',
    'foregroundWindow', 'isScreenOn', 'getFocus'];
  const methods = names.map(name => klass.members.find(node => node.name?.getText(source) === name).getText(source));
  const context = { exports: {}, Date, acceptInput: () => true, isWatchInput: () => false,
    isDirectionalInput: () => false, ShellOverlayMenuLayer: class {} };
  vm.runInNewContext(ts.transpileModule(`export class Harness { ${methods.join('\n')} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const shell = new context.exports.Harness();
  const model = new HomeModel();
  let overlay = false, overlayInputs = 0, sleeps = 0, wakes = 0, menus = 0;
  Object.assign(shell, {
    windows: [], selectedIndex: 0, focus: 'sidebar', screenOn: true, mruWindowIds: [],
    lastInput: null, inputFocusedWindowId: null,
    config: { requestShellRender() {}, onScreenStateChanged(on) { on ? wakes++ : sleeps++; } },
    stack: { isAtBase: () => !overlay, clearToBase: () => { overlay = false; },
      handleInput: () => { overlayInputs++; overlay = false; }, popIfTop: () => false },
    cancelEscapeMenuTimer() {}, endNotificationSelection() {}, returnFromNotification() {},
    openEscapeMenu() { menus++; overlay = true; },
    handleSidebarInput() { return { shell: true, window: false }; },
  });
  const window = id => ({ windowId: id, appId: id, surfaceId: `window:${id}`, title: id,
    inputs: [], closes: 0, renders: 0, visible: false, screen: true, closeable: id !== 'home',
    requestRender() { this.renders++; }, handleInput(e) { this.inputs.push(e.type); },
    setForeground(v) { this.visible = v; }, setScreenOn(v) { this.screen = v; }, close() { this.closes++; } });
  shell.registerWindow(window('launcher'));
  const home = window('home');
  shell.registerHomeWindow(home, waking => waking ? model.wake() : model.returnHome());
  const app = window('calendar');
  shell.registerWindow(app);
  const input = type => shell.receiveInput({ type, source: 'ring', timestampMs: Date.now() });
  return { shell, home, app, model, input, setOverlay: () => { overlay = true; },
    counts: () => ({ overlayInputs, sleeps, wakes, menus }) };
}

test('home owns boot focus; app double tap returns without closing it or changing the card', async () => {
  const h = harness();
  assert.equal(h.shell.foregroundWindow(), h.home);
  assert.equal(h.shell.getFocus(), 'window');
  h.model.move(1);
  h.model.open();
  h.shell.focusWindow('calendar');
  await h.input('double-click');
  assert.equal(h.shell.foregroundWindow(), h.home);
  assert.equal(h.model.selected.id, 'paseo');
  assert.equal(h.model.view, 'home');
  assert.equal(h.app.closes, 0);
  assert.deepEqual(h.app.inputs, []);
});

test('double tap on home sleeps; wake from home or app selects Calendar and focuses home', async () => {
  const h = harness();
  h.model.move(-1);
  await h.input('double-click');
  assert.equal(h.shell.isScreenOn(), false);
  assert.equal(h.home.screen, false);
  await h.input('double-click');
  assert.equal(h.shell.isScreenOn(), true);
  assert.equal(h.model.selected.id, 'calendar');
  assert.equal(h.shell.getFocus(), 'window');
  h.model.move(1);
  h.shell.focusWindow('calendar');
  h.shell.sleep();
  await h.input('display-wake');
  assert.equal(h.shell.foregroundWindow(), h.home);
  assert.equal(h.model.selected.id, 'calendar');
  h.model.move(1);
  await h.input('display-wake');
  assert.equal(h.model.selected.id, 'paseo');
  assert.equal(h.counts().wakes, 2);
});

test('shell overlays retain double tap priority; reserved holds still reach their existing handlers', async () => {
  const h = harness();
  h.shell.focusWindow('calendar');
  h.setOverlay();
  await h.input('double-click');
  assert.equal(h.shell.foregroundWindow(), h.app);
  assert.equal(h.counts().overlayInputs, 1);
  await h.input('long-press');
  assert.equal(h.counts().menus, 1);
  await h.input('double-click');
  assert.equal(h.shell.foregroundWindow(), h.app);
  await h.input('short-then-long-press');
  assert.deepEqual(h.app.inputs, ['short-then-long-press']);
  assert.equal(h.app.closes, 0);
});

test('startup stays on home instead of restoring workers that can steal focus later', async () => {
  const source = ts.createSourceFile('controller.ts', fs.readFileSync('app/g2/dashboard-controller.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const klass = source.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'DashboardController');
  const method = klass.members.find(node => node.name?.getText(source) === 'restoreOpenApps').getText(source);
  const h = harness();
  h.model.move(-1);
  let reads = 0;
  const context = { exports: {}, shell: h.shell, loadPersistedOpenApps() { reads++; throw Error('should not restore workers'); } };
  vm.runInNewContext(ts.transpileModule(`export class Harness { ${method} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const controller = new context.exports.Harness();
  await controller.restoreOpenApps();
  assert.equal(reads, 0);
  assert.equal(h.model.selected.id, 'calendar');
  assert.equal(h.shell.foregroundWindow(), h.home);
  h.model.move(1);
  await controller.restoreOpenApps();
  assert.equal(h.model.selected.id, 'paseo');
});
