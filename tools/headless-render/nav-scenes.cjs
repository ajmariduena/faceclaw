const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const context = createRenderContext();
const { graphics, uiFonts, load, truncateText, TtfFont, adapter } = context;
const bigFont = TtfFont.load(adapter.fontPath, 48);
const { BdfFont } = load('app/graphics/bdffont.ts');
const getFont = (name) => BdfFont.parse(fs.readFileSync(path.join(__dirname, '../../app/fonts/terminus', name === 'terminus32' ? 'ter-u32n.bdf' : 'ter-u24n.bdf'), 'utf8'));
const { drawManeuverGlyph } = load('app/apps/navigate/maneuver-icons.ts');
const { wrapText } = load('app/graphics/textwrap.ts');
const small = uiFonts.getDefaultSmallFont();
const medium = getFont('terminus24');
const large = getFont('terminus32');
const MAP = 260;
const PANEL_X = MAP + 10;
const PITCH = 27;
const FOOTER_TOP = 288 - 4 - 40;

function save(band, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  const file = path.join(__dirname, 'out', `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  console.log(file);
}

// Stand-in for the Mapbox static tile: dim street grid plus the bright route.
function fakeMap(size) {
  const map = new graphics.GrayImage(size, size, 0);
  for (let i = 18; i < size; i += 46) { map.fillRect(0, i, size, 2, 51); map.fillRect(i + 9, 0, 2, size, 51); }
  map.drawLine(0, size - 40, size, 30, 68);
  const route = [[size / 2, size], [size / 2, size / 2], [size / 2, size / 2 - 40], [size - 30, size / 2 - 40], [size - 30, 0]];
  for (let i = 0; i < route.length - 1; i++) {
    for (let w = -2; w <= 2; w++) map.drawLine(route[i][0] + w, route[i][1], route[i + 1][0] + w, route[i + 1][1], 221);
  }
  const cx = size / 2, cy = size / 2 + 20;
  for (let y = -8; y <= 6; y++) {
    const half = Math.round(((y + 8) / 14) * 6);
    map.fillRect(cx - half - 2, cy + y, half * 2 + 5, 1, 0);
  }
  for (let y = -6; y <= 5; y++) {
    const half = Math.round(((y + 6) / 11) * 5);
    map.fillRect(cx - half, cy + y, half * 2 + 1, 1, 255);
  }
  return map;
}

async function main() {
  const face = await stockFont(graphics);
  const text = (image, x, y, label, value, width) => {
    assert.ok(face.measureLine(label) <= width, `overflow: ${label}`);
    face.drawText(image, x, y, label, value);
  };

  // Current UI, same coordinates and fonts as navigate-app.worker.ts.
  {
    const image = new graphics.GrayImage(576, 288);
    image.drawText(medium, 24, 16, 'Navigate', 245);
    const hint = 'Navigation needs a Mapbox public token (free at mapbox.com). Get one, then enter it here or in Settings > API Keys.';
    wrapText(small, hint, 528).forEach((l, i) => image.drawText(small, 24, 52 + i * (small.lineHeight + 2), l, 170));
    image.drawText(small, 16, 288 - 22, '- app menu   •• back', 115);
    save(image, 'nav-now-setup');
  }
  {
    const image = new graphics.GrayImage(576, 288);
    image.drawText(medium, 24, 16, 'Navigate', 245);
    const hint = 'View the map or pick a destination below. Use Voice input (system menu, long-press) to say a destination.';
    const lines = wrapText(small, hint, 528);
    lines.forEach((l, i) => image.drawText(small, 24, 52 + i * (small.lineHeight + 2), l, 170));
    let y = 52 + lines.length * (small.lineHeight + 2) + 6;
    const rows = [['Map', 'View where you are'], ['Home', 'Av. Samborondón km 2,5'], ['Work', 'Edificio The Point, piso 12'], ['Mall del Sol', 'Guayaquil  (recent)']];
    rows.forEach(([a, b], i) => {
      const rowY = y + i * (small.lineHeight + 8);
      if (i === 1) image.drawRoundedRect(20, rowY - 2, 536, small.lineHeight + 6, 238, 6);
      image.drawText(small, 26, rowY + 2, truncateText(small, a, 214), i === 1 ? 245 : 210);
      image.drawText(small, 248, rowY + 2, truncateText(small, b, 300), i === 1 ? 170 : 130);
    });
    image.drawText(small, 16, 288 - 22, '▲▼ select   • go   - app menu   •• back', 115);
    save(image, 'nav-now-idle');
  }
  {
    const image = new graphics.GrayImage(576, 288);
    image.bitBlt(fakeMap(MAP), 0, 0);
    drawManeuverGlyph(image, PANEL_X + 8, 14, 56, 'turn', 'right', 245);
    image.drawText(large, PANEL_X + 76, 24, '500 ft', 250);
    image.drawTextWrapped({ font: medium, x: PANEL_X + 8, y: 84, width: 576 - PANEL_X - 16, text: 'Turn right onto Avenida Francisco de Orellana', value: 220 });
    image.drawText(small, PANEL_X + 8, 288 - 62, '1.5 mi · 9 min · 6:52 PM', 170);
    image.drawText(small, PANEL_X + 8, 288 - 22, '▲▼ zoom   • overview   •• back', 115);
    save(image, 'nav-now-driving');
  }

  // Proposal: terminal-mode frame, Spanish, metric, 24 h, no gesture hints.
  const frame = (left, right) => {
    const image = new graphics.GrayImage(576, 288);
    image.drawRoundedRect(4, 4, 568, 280, 255, 8);
    image.fillRect(14, FOOTER_TOP, 548, 1, 119);
    text(image, 22, FOOTER_TOP + 8, left, 119, 300);
    if (right) text(image, 554 - face.measureLine(right), FOOTER_TOP + 8, right, 119, 260);
    return image;
  };
  {
    const image = frame('· Navegar', 'Carro');
    const rows = [['Casa', 'Av. Samborondón km 2,5', true], ['Trabajo', 'Edificio The Point, piso 12'], ['Mall del Sol', 'Reciente']];
    text(image, 22, 14, 'Dime a dónde vamos.', 255, 532);
    rows.forEach(([a, b, sel], i) => {
      const y = 14 + PITCH * (i + 2);
      if (sel) text(image, 22, y, '>', 255, 20);
      text(image, 42, y, a, sel ? 255 : 204, 170);
      text(image, 220, y, b, sel ? 187 : 119, 330);
    });
    save(image, 'nav-new-idle');
  }
  {
    const image = frame('· 2,4 km · 9 min', 'llegas 18:52');
    const mapSize = FOOTER_TOP - 14;
    const map = fakeMap(mapSize);
    image.bitBlt(map, 10, 9);
    image.drawRect(10, 9, mapSize, mapSize, 85);
    const x = 10 + mapSize + 18;
    drawManeuverGlyph(image, x, 18, 56, 'turn', 'right', 255);
    bigFont.drawText(image, x + 72, 18, '150 m', 255);
    const lines = [];
    let line = '';
    for (const word of 'Gira a la derecha en Av. Francisco de Orellana'.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (face.measureLine(next) <= 554 - x) line = next; else { lines.push(line); line = word; }
    }
    lines.push(line);
    lines.forEach((l, i) => text(image, x, 96 + i * PITCH, l, 255, 554 - x));
    text(image, x, 96 + lines.length * PITCH + 10, 'Luego a la izquierda', 119, 554 - x);
    save(image, 'nav-new-driving');
  }
  {
    const image = frame('· Llegaste', '18:52');
    text(image, 22, 14, 'Edificio The Point', 255, 532);
    text(image, 22, 14 + PITCH, 'Av. Francisco de Orellana, Guayaquil', 170, 532);
    text(image, 22, 14 + PITCH * 2, '2,4 km en 9 min', 119, 532);
    save(image, 'nav-new-arrived');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
