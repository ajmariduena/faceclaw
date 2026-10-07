const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The injected shim (app/apps/evenhub/session.ts) and the published types
// (evenhub-extensions/src/index.ts) describe the same API from two sides.
const source = fs.readFileSync(path.join(__dirname, '../app/apps/evenhub/session.ts'), 'utf8');
const template = source.match(/export function buildFaceclawExtensionsScript[^`]*`([\s\S]*?)`;\n}/)[1];
const shim = template.replace('${JSON.stringify(versionString)}', JSON.stringify('Faceclaw/9.9.9'));
const types = fs.readFileSync(path.join(__dirname, '../evenhub-extensions/src/index.ts'), 'utf8');

function interfaceMembers(name) {
  const body = types.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`))[1];
  const withoutComments = body.replace(/\/\*\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/^ {2}(?:readonly )?(\w+)[?(:]/gm)].map((m) => m[1]).sort();
}

function page() {
  const posted = [];
  const win = {
    console, JSON, Promise, Array, Object, Error, String,
    __faceclawEvenHub: { postMessage(name, argsJson, id) { posted.push({ name, args: JSON.parse(argsJson), id }); } },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(shim, win);
  const fc = win.getFaceclawExtensions();
  return { win, fc, posted };
}

test('the shim implements exactly the members the package declares', () => {
  const { fc } = page();
  assert.deepEqual(Object.keys(fc).sort(), interfaceMembers('FaceclawExtensions'));
});

test('version and api level are available synchronously', () => {
  const { fc } = page();
  assert.equal(fc.getVersion(), 'Faceclaw/9.9.9');
  assert.equal(fc.apiVersion, 1);
});

test('calls resolve with the host value and reject with an Error', async () => {
  const { win, fc, posted } = page();
  const ok = fc.getConfiguredApiKeys();
  const bad = fc.playBuzzer([{ freq: 440, ms: 100 }]);
  assert.deepEqual(posted.map((p) => [p.name, p.args[0]]), [['faceclawExt', 'getConfiguredApiKeys'], ['faceclawExt', 'playBuzzer']]);
  assert.ok(posted.every((p) => p.id > 0));
  win.__fcExtResolve(posted[0].id, true, ['openai']);
  win.__fcExtResolve(posted[1].id, false, 'no glasses');
  assert.deepEqual(await ok, ['openai']);
  await assert.rejects(bad, (error) => error instanceof win.Error && error.message === 'no glasses');
});

test('fire-and-forget calls use id 0', () => {
  const { fc, posted } = page();
  fc.returnToAppSwitcher();
  fc.quit();
  assert.deepEqual(posted.map((p) => [p.args[0], p.id]), [['returnToAppSwitcher', 0], ['quit', 0]]);
});

test('a listener that unsubscribes during dispatch does not skip the next one', () => {
  const { win, fc } = page();
  const seen = [];
  const offA = fc.addWindowLifecycleListener((e) => { seen.push(`a:${e.type}`); offA(); });
  fc.addWindowLifecycleListener((e) => seen.push(`b:${e.type}`));
  win.__fcExtEvent('windowLifecycle', { type: 'hidden' });
  win.__fcExtEvent('windowLifecycle', { type: 'visible' });
  assert.deepEqual(seen, ['a:hidden', 'b:hidden', 'b:visible']);
});

test('the compass is enabled for the first listener and disabled after the last', () => {
  const { win, fc, posted } = page();
  const readings = [];
  const off1 = fc.addCompassListener((r) => readings.push(r.headingDegrees));
  const off2 = fc.addCompassListener(() => {});
  win.__fcExtEvent('compass', { headingDegrees: 90 });
  off1();
  off2();
  assert.deepEqual(readings, [90]);
  assert.deepEqual(posted.map((p) => p.args), [['setCompass', true], ['setCompass', false]]);
});

test('assistant tools send specs to the host and run handlers on invoke', async () => {
  const { win, fc, posted } = page();
  fc.setAssistantTools([
    { name: 'double', description: 'Doubles n', handler: ({ n }) => n * 2 },
    { name: 'fail', description: 'Throws', availability: 'open', handler: () => { throw new Error('nope'); } },
  ]);
  assert.deepEqual(posted[0].args, ['setAssistantTools', [
    { name: 'double', description: 'Doubles n', parameters: { type: 'object', properties: {} }, availability: 'foreground' },
    { name: 'fail', description: 'Throws', parameters: { type: 'object', properties: {} }, availability: 'open' },
  ]]);
  win.__fcExtInvokeTool(7, 'double', { n: 21 });
  win.__fcExtInvokeTool(8, 'fail', {});
  win.__fcExtInvokeTool(9, 'missing', {});
  await new Promise((resolve) => setImmediate(resolve));
  const results = posted.filter((p) => p.name === 'faceclawExtToolResult').map((p) => p.args).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(results, [[7, true, 42], [8, false, 'nope'], [9, false, 'unknown tool missing']]);
});
