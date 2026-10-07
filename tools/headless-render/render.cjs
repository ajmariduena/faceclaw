const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
process.env.NODE_PATH = path.join(__dirname, 'node_modules');
require('node:module').Module._initPaths();
const ts = require('typescript');
const UPNG = require('upng-js');
const root = path.resolve(__dirname, '../..');
const { loader } = require('../../tests/helpers/load-typescript.cjs');
let font;
const fontApi = { getDefaultSmallFont: () => font, getDefaultMediumFont: () => font };
const load = loader({ global: { isAndroid: false, isIOS: false }, Date, Uint32Array, Int32Array, DataView, ArrayBuffer }, {
  '@nativescript/core': { knownFolders: {} },
  '../graphics/ui-fonts': fontApi,
  '../native/settings-store': { getStringSetting: (_key, fallback) => fallback },
  '../native/frame-timings': { spanCurrent: (_name, fn) => fn() },
  '../native/texture-atlas': { textureAtlasAvailable: () => false },
});
font = load('app/graphics/bdffont.ts').BdfFont.parse(fs.readFileSync(path.join(root, 'app/fonts/terminus/ter-u16n.bdf'), 'utf8'));
const graphics = load('app/graphics/image.ts');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const js = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
// Reuse the checked-in native-boundary stubs, not a duplicate chrome renderer.
const testSource = read('tests/app-layout.test.cjs');
const geometrySource = testSource.slice(testSource.indexOf('function geometry()'), testSource.indexOf("\ntest('defaults"));
const chromeStart = testSource.indexOf('const graphics =');
let chromeSource = testSource.slice(chromeStart, testSource.indexOf('\ntest(', chromeStart));
chromeSource = chromeSource.replace(/  const font = \{[\s\S]*?\n  let nextKey/, '  const font = realFont;\n  let nextKey');
const sandbox = {
  fs, path, vm, ts, read, js, realFont: font, assert: require('node:assert/strict'),
  require: (name) => name.startsWith('../.test-build/app/')
    ? load(name.replace('../.test-build/', '').replace(/\.js$/, '.ts'))
    : require(name),
};
vm.runInNewContext(geometrySource + chromeSource + '\nthis.harness = { geometry, chromeLayer };', sandbox);
const g = sandbox.harness.geometry();
g.settings.appSwitcherPositionSetting.value = process.argv[2] || 'bottom';
const { chrome } = sandbox.harness.chromeLayer(g, { windows: 3, phoneBattery: 80 });
const { MenuLayer } = load('app/ui/menu.ts');
const rect = g.rect('min');
const ctx = { stack: { getBaseSize: () => rect, isFocused: () => true } };
const menu = new MenuLayer('Render probe (Terminus)', ['Dashboard', 'Even AI', 'Teleprompter', 'Navigation', 'Translate'].map(label => ({ label, onSelect() {} })), {
  x: 0, y: 0, width: rect.width, minHeight: rect.height, maxHeight: rect.height, opaque: true, showBorder: false,
});
const output = new graphics.GrayImage(640, 480);
output.bitBlt(menu.paint(ctx, () => new graphics.GrayImage(rect.width, rect.height)).withDrawsBaked(), rect.x, rect.y);
output.bitBlt(chrome.paint().withDrawsBaked(), 0, 0, { transparentZero: true });
const rgba = new Uint8Array(640 * 480 * 4);
for (let i = 0; i < output.pixels.length; i++) {
  // Quantize exactly to 16 levels, displayed as neutral grey.
  const v = graphics.grayToNibble(output.pixels[i]) * 17;
  rgba.set([v, v, v, 255], i * 4);
}
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const out = path.join(__dirname, 'out', `chrome-${g.settings.appSwitcherPositionSetting.value}.png`);
fs.writeFileSync(out, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
console.log(JSON.stringify({ out, width: 640, height: 480, font: 'Terminus 16', native: false, inkPixels: output.pixels.filter(x => x > 8).length }));
