// Round 3 (Fable): three home concepts that keep the clock column and use the
// empty right half on scroll. A: Smart Stack with a peek hint. B: glyph grid.
// C: one long page the ring scrolls through.
//   node fable-round3.cjs   → out/fable-*.png and out/fable-*-lens.png
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { scenes } = require('./home-column.cjs');

const context = createRenderContext();
const { graphics, adapter, load, TtfFont } = context;
const { paintHomeColumn } = load('app/apps/home/column-painter.ts');
const { homeColumnState, calendarCardState } = load('app/apps/home/home-model.ts');
const { ICON_SVGS } = load('app/graphics/icons.ts');
const art = load('app/apps/home/stock-art.ts');
const outDir = path.join(__dirname, 'out');
const WHITE = 255, DIM = 153, FAINT = 85;

function png(image, file, tint) {
  const rgba = new Uint8Array(image.width * image.height * 4);
  for (let i = 0; i < image.pixels.length; i++) {
    const v = graphics.grayToNibble(image.pixels[i]) * 17;
    rgba.set(tint ? [Math.round(v * 0.45), v, Math.round(v * 0.5), 255] : [v, v, v, 255], i * 4);
  }
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], image.width, image.height, 0)));
}
function save(band, name) {
  const baked = band.withDrawsBaked();
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(baked, 32, 96);
  fs.mkdirSync(outDir, { recursive: true });
  png(out, path.join(outDir, `fable-${name}.png`));
  png(baked, path.join(outDir, `fable-${name}-lens.png`), true);
  console.log(`fable-${name}`);
}

async function main() {
  const face = await stockFont(graphics);
  await adapter.prepareIcons(['calendar', 'circle', 'glasses', 'battery', 'cloud-sun', 'square-terminal'].map((n) => ICON_SVGS[n]));
  const data = scenes(new Date(2026, 9, 10, 9, 41), calendarCardState);
  const column = () => paintHomeColumn(homeColumnState(data.now, data.battery, data.weather, data.paseo), face);
  const text = (image, x, y, label, value = WHITE, width = image.width - x) => {
    assert.ok(face.measureLine(label) <= width, `overflow: ${label}`);
    face.drawText(image, x, y, label, value);
  };
  const right = (image, xRight, y, label, value = WHITE) => text(image, xRight - face.measureLine(label), y, label, value);
  const icon = (image, name, x, y, value = WHITE, size = 24) => image.drawImage(art.icon(graphics, name, size).dimmed(value / 255), x, y);
  const band = () => { const image = new graphics.GrayImage(576, 288); image.bitBlt(column(), 0, 0); return image; };
  const CARDS = [
    { icon: 'prompt', name: 'Paseo', lines: [['2 need you', WHITE], ['Fix reconnect after BLE drop', DIM], ['¿Apruebas correr los tests?', WHITE], ['1 working', DIM]] },
    { icon: 'calendar', name: 'Calendar', lines: [['10:30  Daily con el equipo', WHITE], ['in 49 min', DIM], ['14:00  Revisión del plan', DIM], ['Tomorrow 09:00  Dentista', DIM]] },
    { icon: 'translate', name: 'Translate', lines: [['ES / EN', WHITE], ['Ready', DIM]] },
    { icon: 'people', name: 'Converse', lines: [['Live facts · ES/EN', WHITE], ['Coming soon', DIM]] },
    { icon: 'more', name: 'More', lines: [['AI Chat · Timers', DIM], ['Navigate · Settings', DIM]] },
  ];

  // Home shared by A and B: the column plus a one-line peek at the bottom right (Pebble timeline peek, Smart Stack hint).
  const homeWithPeek = () => {
    const image = band();
    icon(image, 'calendar', 262, 249, FAINT, 24);
    text(image, 296, 248, '10:30  Daily con el equipo', FAINT, 256);
    return image;
  };
  save(homeWithPeek(), 'home');

  // A · Smart Stack: one card forward, the next two peeking beneath; ordered by relevance, not by app.
  const stackA = (order, index = 1) => {
    const image = band();
    const x = 230, y = 14, w = 318, h = 196;
    [2, 1, 0].forEach((k) => {
      const card = CARDS[order[k]], inset = k * 8, dy = k * 9;
      image.fillRoundedRect(x + inset, y + dy, w - inset * 2, h, 0, 6);
      image.drawRoundedRect(x + inset, y + dy, w - inset * 2, h, k === 0 ? WHITE : k === 1 ? DIM : FAINT, 6);
      if (k === 0) {
        icon(image, card.icon, x + 14, y + 12, WHITE);
        text(image, x + 48, y + 10, card.name, DIM, 200);
        card.lines.forEach(([line, v], i) => text(image, x + 16, y + 50 + i * 27, line, v, w - 32));
      }
    });
    text(image, 300, 248, `${order.length} up`, FAINT);
    right(image, 548, 248, `${index}/5`, FAINT);
    return image;
  };
  save(stackA([0, 1, 2, 3, 4]), 'stack-1');
  save(stackA([1, 2, 3, 4, 0], 2), 'stack-2');

  // B · Glyph grid: six pixel icons at 48 px, the ring walks them in reading order.
  const grid = (selected) => {
    const image = band();
    const apps = [['prompt', 'Paseo'], ['calendar', 'Calendar'], ['translate', 'Translate'], ['people', 'Converse'], ['ai', 'AI Chat'], ['more', 'More']];
    apps.forEach(([ic, name], i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const cx = 230 + col * 108 + 54, cy = 22 + row * 128;
      const on = i === selected;
      if (on) image.drawRoundedRect(cx - 50, cy - 8, 100, 112, WHITE, 8);
      icon(image, ic, cx - 24, cy + 8, on ? WHITE : DIM, 48);
      text(image, cx - Math.round(face.measureLine(name) / 2), cy + 68, name, on ? WHITE : FAINT);
    });
    return image;
  };
  save(grid(0), 'grid-1');
  save(grid(2), 'grid-2');

  // C · One long page: the clock is the top of a page; the ring scrolls the page; the reading line at y=150 picks the section.
  const PAGE_H = 900;
  const page = new graphics.GrayImage(576, PAGE_H);
  page.bitBlt(column(), 0, 0);
  let y = 288 + 16;
  const sections = [];
  CARDS.forEach((card) => {
    const top = y;
    page.fillRect(24, y, 528, 1, FAINT);
    icon(page, card.icon, 24, y + 14, WHITE);
    text(page, 58, y + 12, card.name, DIM);
    card.lines.forEach(([line, v], i) => text(page, 24, y + 48 + i * 27, line, v, 500));
    y += 48 + card.lines.length * 27 + 18;
    sections.push({ top, bottom: y, card });
  });
  const pageAt = (offset) => {
    const image = new graphics.GrayImage(576, 288);
    const src = page.withDrawsBaked();
    for (let yy = 0; yy < 288; yy++) for (let xx = 0; xx < 576; xx++) {
      const sy = yy + offset;
      if (sy >= 0 && sy < PAGE_H) image.setPixel(xx, yy, src.getPixel(xx, sy));
    }
    const line = 150 + offset;
    const hit = sections.find((s) => line >= s.top && line < s.bottom);
    if (hit) image.fillRect(8, hit.top - offset + 10, 3, hit.bottom - hit.top - 20, WHITE);
    const total = PAGE_H - 288, barY = 14 + Math.round((offset / total) * 240);
    image.fillRect(570, 14, 2, 260, FAINT);
    image.fillRect(570, barY, 2, 20, WHITE);
    return image;
  };
  save(pageAt(0), 'page-0');
  save(pageAt(120), 'page-1');
  save(pageAt(310), 'page-2');
  save(pageAt(470), 'page-3');
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
