// The home's Paseo card as counts only (Review, Working, Background, Done),
// next to the tablero clock. Run from this folder:
//   node paseo-card-counts.cjs
// Writes out/pcount-<variant>-lens.png.
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { scenes, COLUMN_ICONS, CARD_ICONS } = require('./home-column.cjs');

const context = createRenderContext();
const { graphics, adapter, load } = context;
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const { ICON_SVGS, renderIcon } = load('app/graphics/icons.ts');
const outDir = path.join(__dirname, 'out');

const WHITE = 255, DIM = 153, FAINT = 85;
const DOTS = [
  ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
];
const numberWidth = (n, pitch) => String(n).length * 7 * pitch - 2 * pitch - (pitch - Math.ceil(pitch * 0.75));
function dotNumber(image, n, x, y, pitch, value) {
  const dot = Math.ceil(pitch * 0.75);
  let cx = x;
  for (const ch of String(n)) {
    DOTS[Number(ch)].forEach((row, dy) => Array.from(row).forEach((on, dx) => {
      if (on === '1') image.fillRect(cx + dx * pitch, y + dy * pitch, dot, dot, value);
    }));
    cx += 7 * pitch;
  }
}

const COUNTS = [['Review', 2, true], ['Working', 3], ['Background', 1], ['Done', 14]];

function header(panel, face) {
  const icon = renderIcon('square-terminal', 24);
  if (icon) panel.drawImage(icon, 20, 18);
  face.drawText(panel, 52, 16, 'Paseo', WHITE);
}
const tone = (n, on = WHITE) => (n ? on : FAINT);

const VARIANTS = {
  // 2×2, the clock's dots at pitch 5 over a dim label.
  cuadricula(panel, face) {
    header(panel, face);
    COUNTS.forEach(([label, n, needs], i) => {
      const cx = 20 + (i % 2) * 139 + 70, y = 66 + Math.floor(i / 2) * 96;
      dotNumber(panel, n, Math.round(cx - numberWidth(n, 5) / 2), y, 5, tone(n));
      const lw = face.measureLine(label);
      face.drawText(panel, Math.round(cx - lw / 2), y + 46, label, tone(n, DIM));
      if (needs) panel.fillRoundedRect(Math.round(cx + lw / 2) + 6, y + 54, 6, 6, WHITE, 3);
    });
  },
  // One row per status: label left, count right.
  filas(panel, face) {
    header(panel, face);
    COUNTS.forEach(([label, n, needs], i) => {
      const y = 64 + i * 48;
      face.drawText(panel, 20, y + 6, label, tone(n, i === 0 ? WHITE : DIM));
      if (needs) panel.fillRoundedRect(20 + face.measureLine(label) + 8, y + 14, 6, 6, WHITE, 3);
      dotNumber(panel, n, 298 - numberWidth(n, 4), y + 4, 4, tone(n));
      if (i < 3) panel.fillRect(20, y + 44, 278, 1, 51);
    });
  },
  // No header: four big counts filling the card, label under each.
  grande(panel, face) {
    COUNTS.forEach(([label, n, needs], i) => {
      const cx = 20 + (i % 2) * 139 + 70, y = 26 + Math.floor(i / 2) * 120;
      dotNumber(panel, n, Math.round(cx - numberWidth(n, 7) / 2), y, 7, tone(n));
      const lw = face.measureLine(label);
      face.drawText(panel, Math.round(cx - lw / 2), y + 60, label, tone(n, DIM));
      if (needs) panel.fillRoundedRect(Math.round(cx + lw / 2) + 6, y + 68, 6, 6, WHITE, 3);
    });
  },
};

function png(image, file) {
  const rgba = new Uint8Array(image.width * image.height * 4);
  for (let i = 0; i < image.pixels.length; i++) {
    const v = graphics.grayToNibble(image.pixels[i]) * 17;
    rgba.set([Math.round(v * 0.45), v, Math.round(v * 0.5), 255], i * 4);
  }
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], image.width, image.height, 0)));
}

async function main() {
  const face = await stockFont(graphics);
  await adapter.prepareIcons([...new Set([...COLUMN_ICONS, ...CARD_ICONS])].map((n) => ICON_SVGS[n]));
  fs.mkdirSync(outDir, { recursive: true });
  const data = scenes(new Date(2026, 9, 11, 9, 41), calendarCardState);
  for (const [name, paint] of Object.entries(VARIANTS)) {
    const band = paintHome(0, data, face).withDrawsBaked();
    band.fillRect(230, 14, 318, 260, 0);
    const panel = new graphics.GrayImage(318, 260);
    panel.drawRoundedRect(0, 0, 318, 260, 255, 6);
    paint(panel, face);
    band.bitBlt(panel.withDrawsBaked(), 230, 14);
    png(band.withDrawsBaked(), path.join(outDir, `pcount-${name}-lens.png`));
    console.log(name);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
