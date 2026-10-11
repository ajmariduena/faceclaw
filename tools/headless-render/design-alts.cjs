// Design alternatives for the lean home and lists, painted with the production
// primitives and the stock font. Run from this folder:
//   node design-alts.cjs
// Writes out/alt-<name>.png (640x480 grey, band at 32,96) and
// out/alt-<name>-lens.png (576x288, green-tinted preview of the band).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { scenes } = require('./home-column.cjs');

const context = createRenderContext();
const { graphics, TtfFont, adapter, load } = context;
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const { ICON_SVGS, renderIcon } = load('app/graphics/icons.ts');
const outDir = path.join(__dirname, 'out');

const WHITE = 255, DIM = 153, FAINT = 85, RULE = 119;
const ICONS = ['square-terminal', 'calendar-days', 'languages', 'messages-square', 'layout-grid', 'sun', 'circle', 'glasses', 'battery', 'sparkles', 'timer', 'navigation', 'settings', 'calendar', 'cloud-sun'];

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
  png(out, path.join(outDir, `alt-${name}.png`));
  png(baked, path.join(outDir, `alt-${name}-lens.png`), true);
  console.log(`alt-${name}`);
}
function ttfFace(size) {
  const font = TtfFont.load(adapter.fontPath, size);
  return { lineHeight: font.lineHeight, measureLine: (t) => font.measureText(t), drawText: (...a) => font.drawText(...a) };
}
const icon = (image, name, x, y, size = 24, value = 255) => {
  const r = renderIcon(name, size);
  if (r) image.drawImage(value === 255 ? r : r.dimmed(value / 255), x, y);
};
function swapArrow(panel, x, y, value) {
  panel.fillRect(x, y + 7, 18, 2, value);
  panel.fillRect(x + 2, y + 15, 18, 2, value);
  for (let s = 0; s < 3; s++) {
    panel.fillRect(x + 12 + s * 2, y + 3 + s * 2, 2, 2, value);
    panel.fillRect(x + 12 + s * 2, y + 11 - s * 2, 2, 2, value);
    panel.fillRect(x + 2 + s * 2, y + 15 + s * 2, 2, 2, value);
    panel.fillRect(x + 2 + s * 2, y + 15 - s * 2, 2, 2, value);
  }
}

async function main() {
  const face = await stockFont(graphics);
  await adapter.prepareIcons(ICONS.map((n) => ICON_SVGS[n]));
  const big28 = ttfFace(28), big26 = ttfFace(26), clock56 = ttfFace(56), clock40 = ttfFace(40);
  const band = () => new graphics.GrayImage(576, 288);
  const text = (image, f, x, y, label, value = WHITE, width = image.width - x) => {
    assert.ok(f.measureLine(label) <= width, `overflow: ${label}`);
    f.drawText(image, x, y, label, value);
  };
  const right = (image, f, xRight, y, label, value = WHITE) => text(image, f, xRight - f.measureLine(label), y, label, value);
  const hdots = (image, cx, y, n, selected) => {
    const step = 14, x0 = cx - Math.round(((n - 1) * step) / 2);
    for (let i = 0; i < n; i++) image.fillRect(x0 + i * step - (i === selected ? 2 : 1), y, i === selected ? 4 : 2, 3, i === selected ? WHITE : FAINT);
  };
  const translateLine = (image, x, y, value, tail) => {
    text(image, face, x, y, 'ES ', value);
    const ax = x + face.measureLine('ES ');
    swapArrow(image, ax, y, value);
    text(image, face, ax + 20, y, ' EN' + (tail || ''), value);
  };
  const data = scenes(new Date(2026, 9, 10, 9, 41), calendarCardState);

  // 0 · Baseline: the production home as it is today (Calendar card).
  save(paintHome(1, data, face), 'baseline');

  // 1 · Stack: every card is a row, nothing hidden, the ring moves ">" down the list.
  const stackRows = [
    { icon: 'square-terminal', name: 'Paseo', line: '2 need you · 1 working' },
    { icon: 'calendar-days', name: 'Calendar', line: 'Daily con el equipo', aside: '10:30' },
    { icon: 'languages', name: 'Translate', translate: true },
    { icon: 'messages-square', name: 'Converse', line: 'Live facts · ES/EN' },
    { icon: 'layout-grid', name: 'More', line: 'AI Chat, Timers, Navigate…' },
  ];
  const stack = (selected) => {
    const image = band();
    text(image, face, 24, 8, '09:41', WHITE);
    text(image, face, 24 + face.measureLine('09:41') + 14, 8, 'Sat 10', DIM);
    icon(image, 'sun', 352, 10, 20, DIM); text(image, face, 377, 8, '27°', DIM);
    icon(image, 'circle', 436, 10, 20, DIM); text(image, face, 461, 8, '72', DIM);
    icon(image, 'glasses', 500, 10, 20, DIM); text(image, face, 525, 8, '88', DIM);
    image.fillRect(24, 40, 528, 1, FAINT);
    stackRows.forEach((row, i) => {
      const y = 52 + i * 47, on = i === selected;
      if (on) text(image, face, 24, y, '>', WHITE);
      icon(image, row.icon, 46, y + 1, 24, on ? WHITE : FAINT);
      text(image, face, 82, y, row.name, on ? WHITE : DIM, 120);
      if (row.translate) translateLine(image, 206, y, on ? WHITE : DIM, ' · Ready');
      else text(image, face, 206, y, row.line, on ? WHITE : DIM, 280);
      if (row.aside) right(image, face, 552, y, row.aside, on ? WHITE : DIM);
    });
    return image;
  };
  save(stack(1), 'stack');
  save(stack(0), 'stack-paseo');

  // 2 · Ticker: the band stays mostly dark; one line near the bottom, closest to the natural gaze.
  const ticker = (selected, label, headline, aside) => {
    const image = band();
    text(image, clock56, 24, 186, '09:41', WHITE);
    const x = 24 + clock56.measureLine('09:41') + 36;
    text(image, face, x, 194, label, DIM, 552 - x);
    text(image, big28, x, 220, headline, WHITE, 552 - x);
    if (aside) right(image, face, 552, 194, aside, DIM);
    hdots(image, x + 28, 266, 5, selected);
    return image;
  };
  save(ticker(1, 'Calendar · in 49 min', 'Daily con el equipo', '10:30 – 11:00'), 'ticker');
  save(ticker(0, 'Paseo · needs you', 'Fix reconnect after BLE drop', '1 working'), 'ticker-paseo');

  // 3 · Big type: one item fills the band at 28 px; the next one waits dim at the bottom.
  {
    const image = band();
    icon(image, 'calendar-days', 24, 12, 24, DIM);
    text(image, face, 58, 10, 'Calendar', DIM);
    right(image, face, 552, 10, '09:41 · Sat 10', DIM);
    text(image, big28, 24, 66, 'Daily con el equipo', WHITE, 528);
    text(image, big28, 24, 106, '10:30 – 11:00  ·  in 49 min', DIM, 528);
    image.fillRect(24, 170, 528, 1, FAINT);
    text(image, face, 24, 184, '14:00', DIM);
    text(image, face, 24 + face.measureLine('14:00') + 14, 184, 'Revisión del plan de soporte', DIM, 420);
    text(image, face, 24, 211, 'Tomorrow', DIM);
    text(image, face, 24 + face.measureLine('Tomorrow') + 14, 211, '09:00  Dentista', DIM, 400);
    hdots(image, 288, 266, 5, 1);
    save(image, 'bigtype');
  }

  // 4 · Timeline: the ring scrolls through what is next, not through apps.
  {
    const image = band();
    const rail = 108;
    text(image, face, 24, 10, '09:41', WHITE);
    text(image, face, rail + 18, 10, 'Sat 10 · 27°', DIM);
    right(image, face, 552, 10, '72 · 88', FAINT);
    image.fillRect(rail, 44, 1, 190, FAINT);
    const rows = [
      { t: 'now', title: 'Paseo needs you', line: 'Fix reconnect after BLE drop', bright: WHITE, dot: true },
      { t: '10:30', title: 'Daily con el equipo', aside: 'in 49 min', focus: true },
      { t: '14:00', title: 'Revisión del plan de soporte' },
      { t: 'Sun', title: '09:00  Dentista', faint: true },
    ];
    let y = 50;
    rows.forEach((row) => {
      const v = row.focus ? WHITE : row.faint ? FAINT : DIM;
      right(image, face, rail - 14, y, row.t, row.focus ? WHITE : FAINT);
      if (row.focus) { image.fillRect(rail - 3, y + 7, 7, 7, WHITE); text(image, face, rail + 18, y, '>', WHITE); }
      else image.fillRect(rail - 1, y + 9, 3, 3, FAINT);
      const x = rail + 18 + (row.focus ? face.measureLine('> ') : 0);
      text(image, face, x, y, row.title, row.bright ?? v, 552 - x - (row.aside ? 90 : 0));
      if (row.aside) right(image, face, 552, y, row.aside, DIM);
      y += 27;
      if (row.line) { text(image, face, rail + 18, y, row.line, DIM, 400); y += 27; }
      y += 12;
    });
    image.fillRect(24, 243, 528, 1, FAINT);
    let x = 24;
    for (const [name, i] of [['Translate', 'languages'], ['Converse', 'messages-square'], ['AI Chat', 'sparkles'], ['More', 'layout-grid']]) {
      icon(image, i, x, 256, 20, FAINT);
      text(image, face, x + 26, 254, name, FAINT);
      x += 26 + face.measureLine(name) + 34;
    }
    save(image, 'timeline');
  }

  // 5 · Dial: the ring turns a wheel on the left; the centre row is the open card on the right.
  {
    const image = band();
    const names = [['Paseo', 'square-terminal'], ['Calendar', 'calendar-days'], ['Translate', 'languages'], ['Converse', 'messages-square'], ['More', 'layout-grid']];
    const selected = 1;
    text(image, face, 24, 8, '09:41', WHITE);
    text(image, face, 24 + face.measureLine('09:41') + 12, 8, 'Sat 10', DIM);
    const centre = 150, pitch = 44;
    for (let k = -2; k <= 2; k++) {
      const [name, ic] = names[(selected + k + 5) % 5];
      const y = centre - 10 + k * pitch;
      const v = k === 0 ? WHITE : Math.abs(k) === 1 ? DIM : FAINT;
      if (k === 0) text(image, face, 24, y, '>', WHITE);
      icon(image, ic, 44, y + 1, 24, v);
      text(image, face, 80, y, name, v, 130);
    }
    const panel = new graphics.GrayImage(318, 260);
    panel.drawRoundedRect(0, 0, 318, 260, WHITE, 6);
    text(panel, face, 20, 16, 'Daily con el equipo', WHITE, 278);
    text(panel, face, 20, 43, '10:30 – 11:00 · in 49 min', DIM, 278);
    text(panel, face, 20, 97, 'Revisión del plan de soporte', WHITE, 278);
    text(panel, face, 20, 124, '14:00 – 15:00', DIM, 278);
    text(panel, face, 20, 178, 'Tomorrow', DIM, 278);
    text(panel, face, 20, 205, 'Dentista', WHITE, 278);
    text(panel, face, 20, 232, '09:00 – 10:00', DIM, 278);
    image.bitBlt(panel.withDrawsBaked(), 230, 14);
    save(image, 'dial');
  }

  // 6 · Focus styles for lists, same More list, four ways to say "this one".
  const more = [['AI Chat', 'sparkles'], ['Timers', 'timer'], ['Navigate', 'navigation'], ['Settings', 'settings']];
  const frame = (footerLeft, footerRight) => {
    const image = band();
    image.drawRoundedRect(4, 4, 568, 280, WHITE, 8);
    image.fillRect(14, 244, 548, 1, RULE);
    text(image, face, 22, 252, footerLeft, RULE);
    if (footerRight) right(image, face, 554, 252, footerRight, RULE);
    return image;
  };
  const focusList = (style) => {
    const image = frame('· More', '1/4');
    more.forEach(([name, ic], i) => {
      const y = 30 + i * 46, on = i === 0;
      if (style === 'chevron') { if (on) text(image, face, 56, y, '>', WHITE); }
      if (style === 'border' && on) image.drawRoundedRect(40, y - 9, 496, 38, WHITE, 6);
      if (style === 'bar' && on) image.fillRoundedRect(40, y - 9, 496, 38, 68, 6);
      if (style === 'zoom') {
        icon(image, ic, 80, y + (on ? 3 : 1), 24, on ? WHITE : DIM);
        if (on) text(image, big26, 118, y - 3, name, WHITE); else text(image, face, 118, y, name, DIM);
        return;
      }
      icon(image, ic, 80, y + 1, 24, on ? WHITE : DIM);
      text(image, face, 118, y, name, on ? WHITE : DIM);
    });
    return image;
  };
  for (const style of ['chevron', 'border', 'bar', 'zoom']) save(focusList(style), `focus-${style}`);

  // 7 · Text size: the same agenda at 20 px stock, 26 and 28 px Roboto Light.
  {
    const image = band();
    const cols = [[face, 27, '20 px · stock'], [big26, 34, '26 px'], [big28, 37, '28 px']];
    const lines = ['10:30 Daily', 'con el equipo', '14:00 Plan de', 'soporte'];
    cols.forEach(([f, pitch, label], c) => {
      const x = 24 + c * 184;
      text(image, face, x, 8, label, FAINT);
      lines.forEach((l, i) => text(image, f, x, 44 + i * pitch, l, i < 2 ? WHITE : DIM, 176));
    });
    save(image, 'textsize');
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
