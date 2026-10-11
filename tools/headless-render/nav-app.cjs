// node tools/headless-render/nav-app.cjs  →  out/nav-app-*.png (the real nav-render.ts over synthetic road tiles)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { loader } = require('../../tests/helpers/load-typescript.cjs');

const { adapter, TtfFont } = createRenderContext();
const load = loader({ global: { isAndroid: true, isIOS: false }, Uint32Array, Int32Array, DataView, ArrayBuffer }, {
  '../native/font-renderer': { fontRenderer: adapter.fontRenderer },
  '../../native/google-maps': { TILE_SIZE: 256 },
});
const graphics = load('app/graphics/image.ts');
const nav = load('app/apps/navigate/nav-render.ts');
const outDir = path.join(__dirname, 'out');
const written = [];

function save(image, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(image.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `nav-app-${name}.png`);
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  written.push(file);
}

/** A city grid like the roads-only Google style: locals every 96 px, an avenue every 384 px. */
function syntheticTile(tx, ty) {
  const tile = new graphics.GrayImage(256, 256, 0);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const wx = tx * 256 + x, wy = ty * 256 + y + Math.round(10 * Math.sin(wx / 140));
      const avenue = wx % 384 < 3 || wy % 384 < 3;
      const local = wx % 96 < 1 || wy % 96 < 1 || (wx + wy) % 520 < 1;
      if (avenue) tile.pixels[y * 256 + x] = 0x76;
      else if (local) tile.pixels[y * 256 + x] = 0x48;
    }
  }
  return tile;
}
const tiles = new Map();
const tile = (x, y) => tiles.get(`${x}/${y}`) ?? tiles.set(`${x}/${y}`, syntheticTile(x, y)).get(`${x}/${y}`);

const C = [1000 * 256 + 96 * 1.0, 2000 * 256 + 60];
function line(from, to, step = 8) {
  const n = Math.max(1, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / step));
  return Array.from({ length: n }, (_, i) => [from[0] + ((to[0] - from[0]) * (i + 1)) / n, from[1] + ((to[1] - from[1]) * (i + 1)) / n]);
}
function route(turnAhead, dx) {
  const corner = [C[0], C[1] - turnAhead];
  const end = [corner[0] + dx, corner[1]];
  return { behind: line(C, [C[0], C[1] + 160]), ahead: [...line(C, corner), ...line(corner, end)], destination: end };
}

async function main() {
  const stock = await stockFont(graphics);
  const face = {
    lineHeight: stock.lineHeight,
    measureLine: (text) => stock.measureLine(text),
    drawText: (image, x, y, text, value = 255) => {
      for (const char of text) assert.ok(char === ' ' || stock.hasGlyph(char.codePointAt(0)), `missing stock glyph: ${char} in "${text}"`);
      assert.ok(Number.isInteger(x) && Number.isInteger(y), `"${text}" at a fractional position is dropped by the firmware font`);
      assert.ok(x >= 0 && x + stock.measureLine(text) <= image.width, `"${text}" overflows at x=${x}`);
      stock.drawText(image, x, y, text, value);
    },
    hasGlyph: (code) => stock.hasGlyph(code),
  };
  const fonts = { face, number: TtfFont.load(adapter.fontPath, 40), unit: TtfFont.load(adapter.fontPath, 22), tiny: TtfFont.load(adapter.fontPath, 12) };
  const map = (r, extra = {}) => ({ zoom: 17, center: C, bearingDeg: 0, tile, route: { behind: r.behind, ahead: r.ahead }, destination: r.destination, faint: false, showChevron: true, northUp: false, ...extra });
  const scenes = [
    ['near-right', { kind: 'guiding', maneuver: 'TURN_RIGHT', roundabout: -1, meters: 80, road: 'Av. Joaquín Orrantia', near: true }, map(route(80, 400))],
    ['far-straight', { kind: 'guiding', maneuver: 'STRAIGHT', roundabout: -1, meters: 1400, road: 'Av. Francisco de Orellana', near: false }, map(route(1400, 0))],
    ['near-left-long', { kind: 'guiding', maneuver: 'TURN_SLIGHT_LEFT', roundabout: -1, meters: 240, road: 'Calle Doctor Alfredo Baquerizo Moreno y Junín', near: true }, map(route(240, -300))],
    ['roundabout', { kind: 'guiding', maneuver: 'ROUNDABOUT_RIGHT_COUNTERCLOCKWISE', roundabout: 3, meters: 150, road: 'Av. del Bombero', near: true }, map(route(150, 300))],
    ['rerouting', { kind: 'rerouting' }, map(route(80, 400), { route: null, faint: true })],
    ['arrived', { kind: 'arrived', name: 'Mall del Sol', side: 'right' }, map(route(40, 0))],
    ['compass-poor', { kind: 'guiding', maneuver: 'TURN_LEFT', roundabout: -1, meters: 60, road: 'Calle Panamá', near: true }, map(route(60, -300), { bearingDeg: 0, showChevron: false, northUp: true }),
      'Brújula imprecisa. Al detenerte, mueve suavemente la cabeza en varias direcciones.'],
    ['waiting', { kind: 'waiting', label: 'Buscando ruta' }, map(route(80, 400), { route: null })],
  ];
  for (const [name, view, streetMap, hint] of scenes) {
    const image = new graphics.GrayImage(576, 288, 0);
    nav.paintGuidance(image, fonts, view, streetMap, hint ?? null);
    save(image, name);
  }
  console.log(written.join('\n'));
}

main().catch((error) => { console.error(error); process.exit(1); });
