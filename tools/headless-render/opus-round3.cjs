// Round 3 of home proposals (Opus): the production clock column stays; the
// empty right half is where scrolling goes. Three concepts:
//   frase  - the right half speaks one sentence; the ring walks clause to clause
//   gemelo - the right half becomes the clock's twin, a dot-matrix reading
//   rollo  - a paper strip prints upward from a slot at the bottom edge
//   node opus-round3.cjs
// Writes out/opus-<concept>-<state>.png (640x480 grey, band at 32,96) and
// out/opus-<concept>-<state>-lens.png (576x288 green).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { scenes } = require('./home-column.cjs');

const context = createRenderContext();
const { graphics, TtfFont, adapter, load } = context;
const { paintHomeColumn, CLOCK_LEFT, CLOCK_TOP } = load('app/apps/home/column-painter.ts');
const { homeColumnState, calendarCardState } = load('app/apps/home/home-model.ts');
const { ICON_SVGS } = load('app/graphics/icons.ts');
const art = load('app/apps/home/stock-art.ts');
const outDir = path.join(__dirname, 'out');

const WHITE = 255, DIM = 153, RULE = 119, FAINT = 85;
const RIGHT_X = 236, RIGHT_END = 552;

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
  png(out, path.join(outDir, `opus-${name}.png`));
  png(baked, path.join(outDir, `opus-${name}-lens.png`), true);
  console.log(`opus-${name}`);
}
function ttfFace(size) {
  const font = TtfFont.load(adapter.fontPath, size);
  return { lineHeight: font.lineHeight, measureLine: (t) => font.measureText(t), drawText: (...a) => font.drawText(...a) };
}

// Same 5x7 numerals and dot grid as column-painter.ts, so the twin reads as the clock's sibling.
const DIGITS = [
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
const DOT = 7, PITCH = 10, DIGIT_PITCH = 65, DIGIT_H = 6 * PITCH + DOT;

function dotRows(image, rows, x, y, { dot = DOT, pitch = PITCH, radius = 3, rowValue = () => WHITE }) {
  rows.forEach((row, dy) => {
    const v = rowValue(dy, rows.length);
    if (!v) return;
    Array.from(row).forEach((on, dx) => { if (on === '1' || on === '#') image.fillRoundedRect(x + dx * pitch, y + dy * pitch, dot, dot, v, radius); });
  });
}
const dotNumber = (image, digits, x, y, opts = {}) => Array.from(digits).forEach((d, i) => dotRows(image, DIGITS[Number(d)], x + i * DIGIT_PITCH, y, opts));
const dotNumberWidth = (digits) => (digits.length - 1) * DIGIT_PITCH + 4 * PITCH + DOT;

function swapArrow(image, x, y, value) {
  image.fillRect(x, y + 7, 18, 2, value);
  image.fillRect(x + 2, y + 15, 18, 2, value);
  for (let s = 0; s < 3; s++) {
    image.fillRect(x + 12 + s * 2, y + 3 + s * 2, 2, 2, value);
    image.fillRect(x + 12 + s * 2, y + 11 - s * 2, 2, 2, value);
    image.fillRect(x + 2 + s * 2, y + 15 + s * 2, 2, 2, value);
    image.fillRect(x + 2 + s * 2, y + 15 - s * 2, 2, 2, value);
  }
}

async function main() {
  const face = await stockFont(graphics);
  await adapter.prepareIcons(['calendar', 'circle', 'glasses', 'battery', 'cloud-sun', 'square-terminal'].map((n) => ICON_SVGS[n]));
  const big26 = ttfFace(26);
  const data = scenes(new Date(2026, 9, 10, 9, 41), calendarCardState);
  const column = () => paintHomeColumn(homeColumnState(data.now, data.battery, data.weather, data.paseo), face);
  const band = (withColumn = true) => { const image = new graphics.GrayImage(576, 288); if (withColumn) image.bitBlt(column(), 0, 0); return image; };
  const text = (image, x, y, label, value = WHITE, width = image.width - x, f = face) => {
    assert.ok(f.measureLine(label) <= width, `overflow: ${label}`);
    f.drawText(image, x, y, label, value);
  };
  const right = (image, xRight, y, label, value = WHITE, f = face) => text(image, xRight - f.measureLine(label), y, label, value, image.width, f);
  const icon = (image, name, x, y, value = WHITE, size = 24) => image.drawImage(art.icon(graphics, name, size).dimmed(value / 255), x, y);
  const translateLine = (image, x, y, value, tail = '') => {
    text(image, x, y, 'ES ', value);
    const ax = x + face.measureLine('ES ');
    swapArrow(image, ax, y + 2, value);
    text(image, ax + 20, y, ' EN' + tail, value);
  };
  const frame = (footerLeft, footerRight) => {
    const image = band(false);
    image.drawRoundedRect(4, 4, 568, 280, WHITE, 8);
    image.fillRect(14, 244, 548, 1, RULE);
    text(image, 22, 252, footerLeft, RULE);
    if (footerRight) right(image, 554, 252, footerRight, RULE);
    return image;
  };

  save(band(), 'rest');

  const clauses = ['2 agents need you.', 'Daily con el equipo at 10:30.', 'Translate is ready.', 'Converse is coming.', 'More.'];
  const sentence = (image, focus, { x = RIGHT_X, width = RIGHT_END - RIGHT_X, bottom = 272, f = big26, pitch = 34 } = {}) => {
    const space = f.measureLine('a b') - f.measureLine('ab');
    const words = clauses.flatMap((c, ci) => c.split(' ').map((w) => ({ w, ci, width: f.measureLine(w) })));
    const lines = [[]];
    let used = 0;
    for (const word of words) {
      const need = (used ? space : 0) + word.width;
      if (used && used + need > width) { lines.push([]); used = 0; }
      lines[lines.length - 1].push(word);
      used += (used ? space : 0) + word.width;
    }
    const top = bottom - lines.length * pitch;
    lines.forEach((line, li) => {
      let wx = x;
      const y = top + li * pitch;
      line.forEach((word, wi) => {
        const on = word.ci === focus;
        text(image, wx, y, word.w, on ? WHITE : DIM, image.width, f);
        if (on) {
          const joined = wi + 1 < line.length && line[wi + 1].ci === focus;
          image.fillRect(wx, y + f.lineHeight + 1, word.width + (joined ? space : 0), 2, WHITE);
        }
        wx += word.width + space;
      });
    });
    return lines.length;
  };
  { const image = band(); sentence(image, 0); save(image, 'frase-scroll'); }
  { const image = band(); sentence(image, 1); save(image, 'frase-nav'); }
  { const image = band(); sentence(image, 4); save(image, 'frase-nav-more'); }
  {
    const image = frame('· Calendar', '1/3');
    text(image, 26, 22, 'Daily con el equipo', WHITE, 520, big26);
    image.fillRect(26, 22 + big26.lineHeight + 1, big26.measureLine('Daily con el equipo'), 2, WHITE);
    text(image, 26, 60, '10:30 – 11:00, in 49 min.', DIM, 520, big26);
    text(image, 26, 112, 'Then Revisión del plan de soporte', DIM, 520, big26);
    text(image, 26, 146, 'at 14:00.', DIM, 520, big26);
    text(image, 26, 192, 'Tomorrow, Dentista at 09:00.', FAINT, 520, big26);
    save(image, 'frase-open');
  }

  const TWIN_X = 252;
  const MIN_ROW = CLOCK_TOP + DIGIT_H + 13;
  const readings = [
    { icon: 'prompt', value: '2', unit: 'need you', lines: [['Fix reconnect after BLE drop', WHITE], ['1 working · 1m', DIM]] },
    { icon: 'calendar', value: '49', unit: 'min', lines: [['Daily con el equipo', WHITE], ['10:30 – 11:00', DIM]] },
    { icon: 'translate', translate: true, lines: [['Ready', DIM]] },
    { icon: 'people', lines: [['Live facts · ES/EN', WHITE], ['Coming soon', DIM]] },
    { icon: 'more', lines: [['AI Chat · Timers', WHITE], ['Navigate · Settings', DIM]] },
  ];
  const positionDots = (image, selected) => { for (let i = 0; i < 5; i++) image.fillRect(218, 120 + i * 11, i === selected ? 4 : 2, 3, i === selected ? WHITE : FAINT); };
  const twin = (image, r, rowValue = () => WHITE, lineValue = (v) => v) => {
    dotRows(image, art.patterns[r.icon], TWIN_X, CLOCK_TOP + 4, { dot: 3, pitch: 5, radius: 1, rowValue: (dy, n) => rowValue(Math.floor((dy * 7) / n), 7) });
    const nx = TWIN_X + 60 + 22;
    if (r.value) {
      dotNumber(image, r.value, nx, CLOCK_TOP, { rowValue });
      text(image, nx + dotNumberWidth(r.value) + 12, CLOCK_TOP + DIGIT_H - face.lineHeight + 4, r.unit, lineValue(DIM), RIGHT_END - nx);
    } else if (r.translate) translateLine(image, nx, CLOCK_TOP + 20, lineValue(WHITE));
    const ly = MIN_ROW + 6;
    r.lines.forEach(([line, v], i) => text(image, TWIN_X, ly + i * 27, line, lineValue(v), RIGHT_END - TWIN_X));
  };
  { const image = band(); twin(image, readings[0]); positionDots(image, 0); save(image, 'gemelo-scroll'); }
  {
    const image = band();
    twin(image, readings[0], (dy) => (dy >= 4 ? FAINT : 0), () => 0);
    twin(image, readings[1], (dy) => (dy < 4 ? WHITE : 0), () => 0);
    positionDots(image, 1);
    save(image, 'gemelo-roll');
  }
  { const image = band(); twin(image, readings[1]); positionDots(image, 1); save(image, 'gemelo-nav'); }
  { const image = band(); twin(image, readings[2]); positionDots(image, 2); save(image, 'gemelo-nav-translate'); }
  // Calendar opened: the dot pane now shows the focused event's start, dim so it is never taken for the clock.
  {
    const image = frame('· Calendar', '1/3');
    icon(image, 'calendar', 22, 14, DIM);
    text(image, 54, 14, 'in 49 min', DIM);
    dotNumber(image, '10', CLOCK_LEFT, CLOCK_TOP, { rowValue: () => DIM });
    dotNumber(image, '30', CLOCK_LEFT, MIN_ROW, { rowValue: () => DIM });
    const rows = [['Daily con el equipo', '10:30 – 11:00', true], ['Revisión del plan de soporte', '14:00 – 15:00'], ['Dentista', 'Tomorrow 09:00']];
    rows.forEach(([title, when, on], i) => {
      const y = 28 + i * 70;
      if (on) text(image, 236, y, '>', WHITE);
      text(image, 256, y, title, on ? WHITE : DIM, 296);
      text(image, 256, y + 27, when, on ? DIM : FAINT, 296);
    });
    save(image, 'gemelo-open');
  }

  const SLOT_Y = 282;
  const sections = [
    { icon: 'prompt', name: 'Paseo', summary: 'Paseo · 2 need you', lines: [['Fix reconnect after BLE drop', WHITE], ['needs you · 1m', DIM]] },
    { icon: 'calendar', name: 'Calendar', summary: 'Calendar · 10:30 Daily', lines: [['Daily con el equipo', WHITE], ['10:30 – 11:00 · in 49 min', DIM], ['14:00  Revisión del plan', DIM]] },
    { icon: 'translate', name: 'Translate', summary: 'Translate · Ready', translate: true, lines: [['Ready', DIM]] },
    { icon: 'people', name: 'Converse', summary: 'Converse · soon', lines: [['Live facts · ES/EN', WHITE], ['Coming soon', DIM]] },
    { icon: 'more', name: 'More', summary: 'More', lines: [['AI Chat · Timers', WHITE], ['Navigate · Settings', DIM]] },
  ];
  const slot = (image, value) => image.fillRect(RIGHT_X - 6, SLOT_Y, RIGHT_END - RIGHT_X + 12, 2, value);
  const perforation = (image, y) => { for (let x = RIGHT_X; x < RIGHT_END; x += 8) image.fillRect(x, y, 4, 1, FAINT); };
  const tearEdge = (image, y) => {
    for (let x = RIGHT_X; x < RIGHT_END; x += 8) for (let s = 0; s < 4; s++) { image.fillRect(x + s, y + 3 - s, 1, 1, FAINT); image.fillRect(x + 4 + s, y + s, 1, 1, FAINT); }
  };
  const strip = (image, current, feed = 0) => {
    const sec = sections[current];
    const h = 36 + (sec.translate ? 27 : 0) + sec.lines.length * 27;
    let top = SLOT_Y - 6 - h + feed;
    const clip = new graphics.GrayImage(576, 288);
    icon(clip, sec.icon, RIGHT_X + 4, top + 2, WHITE);
    text(clip, RIGHT_X + 38, top + 2, sec.name, WHITE);
    let y = top + 36;
    if (sec.translate) { translateLine(clip, RIGHT_X + 4, y, WHITE); y += 27; }
    sec.lines.forEach(([line, v]) => { text(clip, RIGHT_X + 4, y, line, v, RIGHT_END - RIGHT_X - 8); y += 27; });
    for (let i = current - 1; i >= Math.max(0, current - 2); i--) {
      perforation(clip, top - 8);
      top -= 8 + 27 + 6;
      text(clip, RIGHT_X + 4, top + 3, sections[i].summary, i === current - 1 ? RULE : FAINT, RIGHT_END - RIGHT_X - 8);
    }
    if (current <= 2) tearEdge(clip, top - 10);
    else for (let x = RIGHT_X; x < RIGHT_END; x += 8) clip.fillRect(x, top - 8, 4, 1, FAINT);
    const baked = clip.withDrawsBaked();
    for (let yy = SLOT_Y - 1; yy < 288; yy++) baked.fillRect(0, yy, 576, 1, 0);
    image.bitBlt(baked, 0, 0, { transparentZero: true });
    slot(image, DIM);
  };
  { const image = band(); slot(image, FAINT); save(image, 'rollo-rest'); }
  { const image = band(); strip(image, 0, 64); save(image, 'rollo-printing'); }
  { const image = band(); strip(image, 0); save(image, 'rollo-scroll'); }
  { const image = band(); strip(image, 1); save(image, 'rollo-nav'); }
  { const image = band(); strip(image, 4); save(image, 'rollo-nav-more'); }
  {
    const image = frame('· Calendar', '1/3');
    icon(image, 'calendar', 22, 14, WHITE);
    text(image, 56, 14, 'Today', WHITE);
    right(image, 554, 14, 'Sat 10', DIM);
    const rows = [['10:30', 'Daily con el equipo', true], ['14:00', 'Revisión del plan de soporte'], ['Sun', ''], ['09:00', 'Dentista']];
    let y = 56;
    rows.forEach(([t, title, on]) => {
      if (!title) {
        const label = `${t} 11`, lx = 288 - Math.round(face.measureLine(label) / 2);
        for (let x = 42; x < lx - 10; x += 8) image.fillRect(x, y + 13, 4, 1, FAINT);
        for (let x = lx + face.measureLine(label) + 10; x < 552; x += 8) image.fillRect(x, y + 13, 4, 1, FAINT);
        text(image, lx, y, label, FAINT);
        y += 36;
        return;
      }
      if (on) text(image, 22, y, '>', WHITE);
      text(image, 42, y, t, on ? WHITE : DIM);
      for (let x = 110; x < 140; x += 6) image.fillRect(x, y + 17, 2, 2, FAINT);
      text(image, 148, y, title, on ? WHITE : DIM, 400);
      y += 40;
    });
    save(image, 'rollo-open');
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
