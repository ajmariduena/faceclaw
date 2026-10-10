// Render-only study. Run from tools/headless-render: node home-clock-astra.cjs
// Production paintHome owns the card and pagination; only x < 214 is replaced.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { graphics, TtfFont, adapter, load } = createRenderContext();
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const { ICON_SVGS } = load('app/graphics/icons.ts');
const svgs = {
  ...ICON_SVGS,
  // Lucide circle and glasses, lucide-static v1.55.0, ISC license.
  // Embedded here so the render does not depend on an ephemeral /tmp package.
  ring: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10"/></svg>',
  glasses: '<svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="15" r="4"/><circle cx="18" cy="15" r="4"/><path d="M14 15a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M2.5 13 5 7c.7-1.3 1.4-2 3-2"/><path d="M21.5 13 19 7c-.7-1.3-1.5-2-3-2"/></svg>',
};
const font = size => {
  const face = TtfFont.load(adapter.fontPath, size);
  assert.ok(face, `Roboto Light ${size} must load`);
  return face;
};
const small = font(20);
const asFace = face => ({ lineHeight: face.lineHeight, measureLine: s => face.measureText(s), drawText: (...args) => face.drawText(...args) });

// Work with baked, tightly bounded ink, avoiding font ascender padding when
// centering the large clock. No scaling or firmware clock assets are used.
function textInk(face, text, value = 255) {
  const source = new graphics.GrayImage(Math.ceil(face.measureText(text)) + 8, face.lineHeight + 4);
  face.drawText(source, 2, 0, text, value);
  const baked = source.withDrawsBaked();
  let left = baked.width, top = baked.height, right = -1, bottom = -1;
  for (let y = 0; y < baked.height; y++) for (let x = 0; x < baked.width; x++) {
    if (baked.pixels[y * baked.width + x]) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  assert.ok(right >= left, `Missing ink: ${text}`);
  const cropped = new graphics.GrayImage(right - left + 1, bottom - top + 1);
  cropped.bitBlt(baked, -left, -top);
  return cropped;
}

function complications(image) {
  const icon = (name, x, y, size) => image.bitBlt(adapter.rasterizeSvg(svgs[name], size, 2, graphics.GrayImage), x, y);
  const label = (text, x, y, maxWidth) => {
    const ink = textInk(small, text, 221);
    assert.ok(ink.width <= maxWidth, `Complication too wide: ${text}`);
    image.bitBlt(ink, x, y);
  };
  icon('calendar-days', 16, 20, 18);
  label('Sat 10', 41, 22, 66);
  // Two device complications: recognizable silhouettes, normal numerals,
  // and a compact charge track below each value.
  for (const [name, center, percent] of [['ring', 137, 75], ['glasses', 186, 90]]) {
    icon(name, center - 10, 12, 20);
    const ink = textInk(small, `${percent}%`, 221);
    image.bitBlt(ink, center - Math.floor(ink.width / 2), 37);
    image.fillRect(center - 17, 58, 34, 2, 51);
    image.fillRect(center - 17, 58, Math.round(34 * percent / 100), 2, 187);
  }
  icon('cloud-sun', 16, 249, 24);
  label('27°C', 48, 254, 70);
  icon('square-terminal', 152, 249, 24);
  label('2', 187, 254, 18);
}

// Original 5x7 numerals: open counters, a recognizable diagonal 2/7,
// equal pitch and generous inter-digit spacing, unlike the dense stock mock.
const matrixDigits = [
  ['01110','10001','10001','10001','10001','10001','01110'],
  ['00100','01100','00100','00100','00100','00100','01110'],
  ['01110','10001','00001','00010','00100','01000','11111'],
  ['11110','00001','00001','01110','00001','00001','11110'],
  ['00010','00110','01010','10010','11111','00010','00010'],
  ['11111','10000','10000','11110','00001','00001','11110'],
  ['01110','10000','10000','11110','10001','10001','01110'],
  ['11111','00001','00010','00100','01000','01000','01000'],
  ['01110','10001','10001','01110','10001','10001','01110'],
  ['01110','10001','10001','01111','00001','00001','01110'],
];
function matrix(image, hh, mm) {
  for (const [pair, y] of [[hh, 78], [mm, 158]]) {
    [...pair].forEach((digit, i) => matrixDigits[Number(digit)].forEach((row, dy) => {
      [...row].forEach((on, dx) => {
        if (on === '1') image.fillRoundedRect(50 + i * 65 + dx * 10, y + dy * 10, 7, 7, 255, 3);
      });
    }));
  }
}
function air(image, hh, mm) {
  const large = font(100);
  for (const [pair, y] of [[hh, 76], [mm, 160]]) {
    const ink = textInk(large, pair);
    assert.ok(ink.width <= 174 && ink.height <= 78, 'Air clock must fit its slot');
    image.bitBlt(ink, Math.round((214 - ink.width) / 2), y);
  }
}
const segments = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
function segment(image, hh, mm) {
  // Original straight segment geometry, with a 3px break at every junction.
  const parts = { a:[8,0,38,5], b:[49,8,5,25], c:[49,41,5,25], d:[8,69,38,5], e:[0,41,5,25], f:[0,8,5,25], g:[8,35,38,5] };
  for (const [pair, y] of [[hh, 75], [mm, 158]]) {
    [...pair].forEach((digit, i) => {
      for (const name of segments[Number(digit)]) {
        const [dx, dy, w, h] = parts[name];
        image.fillRoundedRect(43 + i * 74 + dx, y + dy, w, h, 255, 2);
      }
    });
  }
}

function save(band, name) {
  const output = new graphics.GrayImage(640, 480);
  output.bitBlt(band, 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  const levels = new Set();
  for (let i = 0; i < output.pixels.length; i++) {
    const v = graphics.grayToNibble(output.pixels[i]) * 17;
    levels.add(v);
    // G2 green preview: 16 luminance steps; black denotes no emitted light.
    rgba.set([0, v, 0, 255], i * 4);
    const x = i % 640, y = Math.floor(i / 640);
    if (x < 32 || x >= 608 || y < 96 || y >= 384) assert.equal(v, 0);
  }
  assert.ok(levels.size <= 16);
  const file = path.join(__dirname, 'out', `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  console.log(JSON.stringify({ file, width: 640, height: 480, levels: levels.size, rightSideUnchanged: true }));
}

async function main() {
  // Use the existing stock loader for the unmodified production right card.
  // All new text and clock glyphs use bundled Roboto or original geometry.
  const stock = await stockFont(graphics);
  await adapter.prepareIcons(['ring', 'glasses', 'calendar-days', 'cloud-sun', 'square-terminal'].map(name => svgs[name]));
  for (const [hh, mm] of [['09', '41'], ['22', '07']]) {
    const now = new Date(2026, 9, 10, Number(hh), Number(mm));
    const data = {
      now, calendar: calendarCardState(true, [], now.getTime()), translateReady: true,
      paseo: { configured: true, status: '', needs: 2, working: 1, updates: [
        { agentId: 'a', title: 'BLE reconnect', bucket: 'needs', activityMs: now.getTime() - 60000, line: 'Approve the BLE tests?' },
        { agentId: 'b', title: 'CLI review', bucket: 'ready', activityMs: now.getTime() - 240000, line: 'Ready to merge.' },
      ] },
    };
    const baseline = paintHome(0, data, stock, asFace(font(80))).withDrawsBaked();
    for (const [name, clock] of Object.entries({ matrix, air, segment })) {
      const band = new graphics.GrayImage(576, 288);
      band.bitBlt(baseline, 0, 0);
      band.fillRect(0, 0, 214, 288, 0);
      complications(band);
      clock(band, hh, mm);
      const baked = band.withDrawsBaked();
      for (let y = 0; y < 288; y++) for (let x = 214; x < 576; x++) {
        assert.equal(baked.pixels[y * 576 + x], baseline.pixels[y * 576 + x], `Production pixel changed at ${x},${y}`);
      }
      save(baked, `home-clock-astra-${name}-${hh}${mm}`);
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
