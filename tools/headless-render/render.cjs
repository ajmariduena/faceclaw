const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
process.env.NODE_PATH = path.join(__dirname, 'node_modules');
require('node:module').Module._initPaths();
const ts = require('typescript');
const UPNG = require('upng-js');
const root = path.resolve(__dirname, '../..');
const { loader } = require('../../tests/helpers/load-typescript.cjs');
const calendarScenes = require('./calendar-scenes.cjs');
const stockScenes = require('./stock-scenes.cjs');
const v3Scenes = require('./v3-scenes.cjs');
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
const mode = process.argv[2] || 'bottom';
if (!['bottom', 'popup', 'home', 'home-scrolled', 'home-alt', 'calendar', 'calendar-even', 'transition', 'transition-even', 'stock-all', 'stock-menu-open', 'stock-open', ...stockScenes.modes, 'v3-all', 'v3-enter', ...v3Scenes.modes].includes(mode)) {
  throw new Error('Usage: node render.cjs [bottom|popup|home|home-scrolled|home-alt|calendar|calendar-even|transition|transition-even|stock-all|stock-menu-open|stock-open|stock-<scene>|v3-all|v3-enter|v3-<scene>]');
}

function renderChrome() {
  g.settings.appSwitcherPositionSetting.value = mode;
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
  return { output, name: `chrome-${mode}`, font: 'Terminus 16', icons: 'placeholders' };
}

function createRenderContext() {
  const assert = require('node:assert/strict');
  const { createNativeAdapter } = require('./native-adapter.cjs');
  const adapter = createNativeAdapter(root);
  let homeGraphics;
  const homeLoad = loader({ global: { isAndroid: true, isIOS: false }, Date: calendarScenes.FixedDate, Uint32Array, Int32Array, DataView, ArrayBuffer }, {
    '@nativescript/core': { knownFolders: {} },
    '../native/font-renderer': { fontRenderer: adapter.fontRenderer },
    '../native/settings-store': { getStringSetting: (_key, fallback) => fallback, onSettingsStoreChanged: () => {} },
    './installed-fonts': { ensurePreinstalledFonts() {}, installedFontPath: () => adapter.fontPath },
    '../native/svg-rasterizer': { rasterizeSvg: (svg, size, stroke) => adapter.rasterizeSvg(svg, size, stroke, homeGraphics.GrayImage) },
    '../native/frame-timings': { spanCurrent: (_name, fn) => fn() },
    '../native/texture-atlas': { textureAtlasAvailable: () => false },
    '../../native/calendar': { readUpcomingEvents: () => calendarScenes.events, getCalendarReadState: () => 'ready' },
    '../../native/calendar-permissions': { hasCalendarPermission: () => true },
    '../../ui/dashboard-settings': { timeFormatSetting: { get: () => '24h' } },
  });
  homeGraphics = homeLoad('app/graphics/image.ts');
  const uiFonts = homeLoad('app/graphics/ui-fonts.ts');
  const { TtfFont } = homeLoad('app/graphics/ttf-font.ts');
  const { renderIcon, ICON_SVGS } = homeLoad('app/graphics/icons.ts');
  const { drawBattery } = homeLoad('app/graphics/battery.ts');
  const { truncateText } = homeLoad('app/graphics/textwrap.ts');
  g.settings.appSwitcherPositionSetting.value = 'popup';
  g.settings.statusBarVisibilitySetting.value = 'switcher';
  g.settings.windowBorderSetting.value = false;
  const rect = g.rect('min');
  assert.deepEqual({ ...rect }, { x: 32, y: 96, width: 576, height: 288 });
  return { adapter, load: homeLoad, graphics: homeGraphics, uiFonts, TtfFont, renderIcon, ICON_SVGS, drawBattery, truncateText, rect };
}

async function renderHome(homeMode = mode, selectedOverride) {
  const assert = require('node:assert/strict');
  const { adapter, graphics: homeGraphics, uiFonts, TtfFont, renderIcon, ICON_SVGS, drawBattery, truncateText, rect } = createRenderContext();
  const apps = [
    ['AI Chat', 'message-circle'], ['Notifications', 'bell'], ['Calendar', 'calendar'],
    ['Music', 'music'], ['Timers', 'timer'], ['Navigate', 'map'],
    ['Teleprompter', 'scroll-text'], ['Settings', 'settings'], ['Más…', 'layout-grid'],
  ];
  await adapter.prepareIcons([...new Set([...apps.map((app) => app[1]), 'cloud-sun'])].map((name) => ICON_SVGS[name]));
  const alt = homeMode === 'home-alt';
  const selected = selectedOverride ?? (homeMode === 'home-scrolled' ? 5 : 0);
  const visible = alt ? 4 : 5;
  const first = selected >= visible ? Math.min(selected - 1, apps.length - visible) : 0;
  const panel = { x: alt ? 304 : 320, y: 8, width: alt ? 264 : 248, height: 272 };
  const rowHeight = alt ? 52 : 44;
  const rowFont = TtfFont.load(adapter.fontPath, alt ? 22 : 20);
  const clockFont = TtfFont.load(adapter.fontPath, 64);
  const small = uiFonts.getDefaultSmallFont();
  const medium = uiFonts.getDefaultMediumFont();
  assert.ok(rowFont && clockFont && small.atlasKey.startsWith('ttf:Roboto-Light'));
  const image = new homeGraphics.GrayImage(rect.width, rect.height);
  const drawText = (face, x, y, text, value, width) => {
    assert.ok(face.measureText(text) <= width, `Text does not fit: ${text}`);
    image.drawText(face, x, y, text, value);
  };
  drawText(clockFont, 20, 24, '09:41', 255, panel.x - 40);
  drawText(medium, 23, 108, 'Miércoles, 7 oct', 204, panel.x - 44);
  image.drawImage(drawBattery(82, false), 24, 152);
  drawText(small, 62, 146, 'Gafas 82%', 187, panel.x - 82);
  image.drawImage(renderIcon('cloud-sun', 20).dimmed(0.8), 24, 206);
  drawText(medium, 56, 202, '18° Nublado', 221, panel.x - 76);
  image.drawImage(renderIcon('calendar', 20).dimmed(0.65), 24, 240);
  drawText(medium, 56, 236, '10:30 Daily', 204, panel.x - 76);
  image.drawRoundedRect(panel.x, panel.y, panel.width, panel.height, 119, 16);
  for (let slot = 0; slot < visible; slot++) {
    const index = first + slot;
    const [label, icon] = apps[index];
    const active = index === selected;
    const row = new homeGraphics.GrayImage(panel.width - 24, rowHeight - 4);
    const value = active ? 255 : 170;
    row.drawImage(renderIcon(icon, 20).dimmed(value / 255), 12, Math.floor((row.height - 20) / 2));
    const text = truncateText(rowFont, label, row.width - 54);
    assert.equal(text, label, 'Default app labels must fit without truncation');
    row.drawText(rowFont, 44, Math.floor((row.height - rowFont.lineHeight) / 2), text, value);
    const x = panel.x + 12;
    const y = panel.y + 18 + slot * rowHeight;
    if (active) image.drawMenuSelection(row, x, y, 0, 238, 8, 0);
    else image.drawImage(row, x, y);
  }
  const page = `${selected + 1} / ${apps.length}`;
  drawText(small, panel.x + panel.width - 20 - small.measureText(page), 254, page, 153, 80);
  const output = new homeGraphics.GrayImage(640, 480);
  output.bitBlt(image.withDrawsBaked(), rect.x, rect.y);
  return { output, name: homeMode, viewport: rect, font: 'Roboto Light', fontSizes: { small: small.sizePx, medium: medium.sizePx, list: rowFont.sizePx, clock: clockFont.sizePx }, icons: 'production Lucide SVGs via Skia', selected: selected + 1, firstVisible: first + 1, visible };
}

function save(result) {
  const { output, name, ...metadata } = result;
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < output.pixels.length; i++) {
    // Quantize exactly to 16 levels, displayed as neutral grey.
    const v = graphics.grayToNibble(output.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  const out = path.join(__dirname, 'out', `${name}.png`);
  fs.writeFileSync(out, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  console.log(JSON.stringify({ out, width: 640, height: 480, ...metadata, native: false, inkPixels: output.pixels.filter(x => x > 8).length }));
}

async function main() {
  if (mode.startsWith('v3-')) {
    for await (const result of v3Scenes.renderV3(createRenderContext(), mode)) save(result);
    return;
  }
  if (mode.startsWith('stock-')) {
    for (const result of await stockScenes.renderStock(createRenderContext(), mode)) save(result);
    return;
  }
  if (mode.startsWith('home')) return save(await renderHome());
  if (mode.startsWith('calendar')) return save(calendarScenes.renderCalendar(createRenderContext(), mode));
  if (mode.startsWith('transition')) {
    const home = await renderHome('home', 2);
    const context = createRenderContext();
    const current = calendarScenes.renderCalendar(context, 'calendar');
    const styled = calendarScenes.renderCalendar(context, 'calendar-even');
    for (const result of calendarScenes.renderTransitions(context, home, current, styled, mode)) save(result);
    return;
  }
  save(renderChrome());
}

module.exports = { createRenderContext };

if (require.main === module) main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
