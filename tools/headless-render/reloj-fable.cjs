// Clock variants for the resting home, inside the production layout: paintHome
// paints the column and the card, then the clock block (x 0–212, y 44–240) is
// cleared and repainted. Run from this folder:
//   node reloj-fable.cjs
// Writes out/reloj-<n>-<name>-<hhmm>.png (640x480 grey, band at 32,96),
// out/reloj-<n>-<name>-<hhmm>-lens.png (576x288 green) and out/reloj-sheet-lens.png.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { scenes, COLUMN_ICONS, CARD_ICONS } = require('./home-column.cjs');

const context = createRenderContext();
const { graphics, adapter, load, TtfFont } = context;
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const { ICON_SVGS } = load('app/graphics/icons.ts');
const root = path.resolve(__dirname, '../..');
const ttf = (name) => path.join(root, 'app/fonts/ttf', `${name}.ttf`);
const outDir = path.join(__dirname, 'out');

const WHITE = 255, DIM = 153, FAINT = 85;
const COLUMN_W = 212, CLOCK_TOP = 44, CLOCK_BOTTOM = 240, CENTER_X = 106, CENTER_Y = 142;

// The render adapter registers Roboto Light only; the tile and hollow variants need Bold faces.
function pathAwareFontRenderer() {
  const families = new Map();
  const family = (file) => {
    if (!families.has(file)) {
      const name = `Reloj-${path.basename(file, '.ttf')}`;
      if (!GlobalFonts.registerFromPath(file, name)) throw new Error(`Cannot load ${file}`);
      families.set(file, name);
    }
    return families.get(file);
  };
  const contexts = new Map();
  const ctxFor = (file, size) => {
    const key = `${file}@${size}`;
    if (!contexts.has(key)) {
      const ctx = createCanvas(size * 4, size * 4).getContext('2d');
      ctx.font = `${size}px ${family(file)}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff';
      contexts.set(key, ctx);
    }
    return contexts.get(key);
  };
  const metrics = (file, size) => {
    const m = ctxFor(file, size).measureText('Hg');
    return [Math.ceil(m.fontBoundingBoxAscent), Math.ceil(m.fontBoundingBoxDescent)];
  };
  adapter.fontRenderer.getFontMetrics = (file, size) => [...metrics(file, size), 0].join(' ');
  adapter.fontRenderer.measureTextExact = (file, text, size) => ctxFor(file, size).measureText(text).width;
  adapter.fontRenderer.renderGlyphCell = (file, size, cp, gamma) => {
    const ctx = ctxFor(file, size);
    const text = String.fromCodePoint(cp);
    const m = ctx.measureText(text);
    const [ascent] = metrics(file, size);
    const left = -Math.ceil(m.actualBoundingBoxLeft);
    const top = Math.ceil(m.actualBoundingBoxAscent);
    const width = Math.max(0, Math.ceil(m.actualBoundingBoxRight) - left);
    const height = Math.max(0, top + Math.ceil(m.actualBoundingBoxDescent));
    const bytes = Buffer.alloc(10 + width * height);
    bytes.writeUInt16LE(Math.round(m.width * 64), 0);
    bytes.writeInt16LE(left, 2);
    bytes.writeInt16LE(ascent - top, 4);
    bytes.writeUInt16LE(width, 6);
    bytes.writeUInt16LE(height, 8);
    if (width && height) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.fillText(text, -left, top);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      for (let i = 0; i < width * height; i++) bytes[10 + i] = Math.round(255 * (rgba[i * 4 + 3] / 255) ** gamma);
    }
    return bytes;
  };
}

// ---------- digit shapes ----------
// 5x7 glyphs copied from column-painter.ts so every dot variant keeps the production numerals.
const DOTS_5x7 = [
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
// 3x5 glyphs in the Game Boy / OP-1 manner: solid cells, the 1 with a flag and a foot.
const BLOCKS_3x5 = [
  ['111', '101', '101', '101', '111'],
  ['010', '110', '010', '010', '111'],
  ['111', '001', '111', '100', '111'],
  ['111', '001', '111', '001', '111'],
  ['101', '101', '111', '001', '001'],
  ['111', '100', '111', '001', '111'],
  ['111', '100', '111', '101', '111'],
  ['111', '001', '001', '001', '001'],
  ['111', '101', '111', '101', '111'],
  ['111', '101', '111', '001', '111'],
];
// Seven segments a..g, Casio / VFD map.
const SEGMENTS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];

/** A dot-matrix digit; returns its width and height. */
function dotDigit(image, digit, x, y, { dot, pitch, value = WHITE, radius = 3 }) {
  DOTS_5x7[digit].forEach((row, dy) => Array.from(row).forEach((on, dx) => {
    if (on === '1') image.fillRoundedRect(x + dx * pitch, y + dy * pitch, dot, dot, value, radius);
  }));
  return { w: 4 * pitch + dot, h: 6 * pitch + dot };
}
const dotSize = ({ dot, pitch }) => ({ w: 4 * pitch + dot, h: 6 * pitch + dot });

function blockDigit(image, digit, x, y, cell, value = WHITE) {
  BLOCKS_3x5[digit].forEach((row, dy) => Array.from(row).forEach((on, dx) => {
    if (on === '1') image.fillRect(x + dx * cell, y + dy * cell, cell, cell, value);
  }));
}

/** One seven-segment digit of w x h with bars of thickness t and 45° chamfered ends, 1 px apart. */
function segmentDigit(image, digit, x, y, w, h, t, value = WHITE) {
  const half = Math.floor(t / 2);
  const gap = 1;
  const hbar = (x0, x1, cy) => {
    for (let dy = -half; dy <= half; dy++) {
      const inset = Math.abs(dy);
      image.fillRect(x0 + inset, cy + dy, x1 - x0 - 2 * inset, 1, value);
    }
  };
  const vbar = (y0, y1, cx) => {
    for (let dx = -half; dx <= half; dx++) {
      const inset = Math.abs(dx);
      image.fillRect(cx + dx, y0 + inset, 1, y1 - y0 - 2 * inset, value);
    }
  };
  const cxL = x + half, cxR = x + w - 1 - half;
  const cyT = y + half, cyM = y + Math.floor(h / 2), cyB = y + h - 1 - half;
  const on = SEGMENTS[digit];
  if (on.includes('a')) hbar(x + half + gap, x + w - half - gap, cyT);
  if (on.includes('g')) hbar(x + half + gap, x + w - half - gap, cyM);
  if (on.includes('d')) hbar(x + half + gap, x + w - half - gap, cyB);
  if (on.includes('f')) vbar(cyT + half + gap, cyM - half - gap + 1, cxL);
  if (on.includes('b')) vbar(cyT + half + gap, cyM - half - gap + 1, cxR);
  if (on.includes('e')) vbar(cyM + half + gap, cyB - half - gap + 1, cxL);
  if (on.includes('c')) vbar(cyM + half + gap, cyB - half - gap + 1, cxR);
}

/** Rasterise `text` with a TTF face into a tight image: { image, inkTop, inkLeft, inkW, inkH }. */
function glyphs(font, text) {
  const scratch = new graphics.GrayImage(400, 200);
  font.drawText(scratch, 20, 20, text, WHITE);
  const baked = scratch.withDrawsBaked();
  let minX = 400, maxX = -1, minY = 200, maxY = -1;
  for (let y = 0; y < 200; y++) for (let x = 0; x < 400; x++) {
    if (baked.pixels[y * 400 + x] >= 128) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  assert.ok(maxX >= 0, `no ink for ${text}`);
  return { baked, inkLeft: minX, inkTop: minY, inkW: maxX - minX + 1, inkH: maxY - minY + 1 };
}

/** Thresholded glyph ink minus its erosion by `stroke` px: an outline of constant width. */
function hollow(source, stroke) {
  const { width, height, pixels } = source;
  const solid = (x, y) => x >= 0 && y >= 0 && x < width && y < height && pixels[y * width + x] >= 128;
  const out = new graphics.GrayImage(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!solid(x, y)) continue;
    let edge = false;
    for (let dy = -stroke; dy <= stroke && !edge; dy++) for (let dx = -stroke; dx <= stroke; dx++) {
      if (dx * dx + dy * dy <= stroke * stroke && !solid(x + dx, y + dy)) { edge = true; break; }
    }
    if (edge) out.pixels[y * width + x] = WHITE;
  }
  return out;
}

function blitInk(image, glyph, x, y, value = WHITE) {
  for (let yy = 0; yy < glyph.inkH; yy++) for (let xx = 0; xx < glyph.inkW; xx++) {
    const v = glyph.baked.pixels[(glyph.inkTop + yy) * glyph.baked.width + glyph.inkLeft + xx];
    if (v >= 128) image.setPixel(x + xx, y + yy, value);
  }
}

// ---------- variants ----------
// Each paints `hh`/`mm` (two-char strings) into the cleared block and returns a one-line measure note.
function makeVariants(fonts) {
  const stacked = (image, hh, mm, opts, { gap, hoursValue = WHITE, minutesValue = WHITE, pitch }) => {
    const { w, h } = dotSize(opts);
    const blockW = pitch + w;
    const blockH = 2 * h + gap;
    const left = CENTER_X - Math.round(blockW / 2);
    const top = CENTER_Y - Math.round(blockH / 2);
    Array.from(hh).forEach((d, i) => dotDigit(image, Number(d), left + i * pitch, top, { ...opts, value: hoursValue }));
    Array.from(mm).forEach((d, i) => dotDigit(image, Number(d), left + i * pitch, top + h + gap, { ...opts, value: minutesValue }));
    return { left, top, w: blockW, h: blockH, digit: `${w}×${h}` };
  };
  return [
    {
      name: 'actual',
      note: 'Reloj de producción sin cambios (DOT 7, PITCH 10, dígito 47×67, HH y 70, MM y 150).',
      paint: () => null,
    },
    {
      name: 'tupido',
      ref: 'Nothing NDot (widget de reloj / pantalla de bloqueo)',
      paint: (image, hh, mm) => stacked(image, hh, mm, { dot: 9, pitch: 11, radius: 4 }, { gap: 12, pitch: 66, minutesValue: DIM }),
    },
    {
      name: 'fino',
      ref: 'Braun / Rams: la misma retícula con menos tinta',
      paint: (image, hh, mm) => stacked(image, hh, mm, { dot: 5, pitch: 9, radius: 2 }, { gap: 14, pitch: 56 }),
    },
    {
      name: 'segmentos',
      ref: 'Casio F-91W, VFD IV-11',
      paint: (image, hh, mm) => {
        const w = 44, h = 72, t = 8, pitch = 60, gap = 14;
        const left = CENTER_X - Math.round((pitch + w) / 2);
        const top = CENTER_Y - Math.round((2 * h + gap) / 2);
        Array.from(hh).forEach((d, i) => segmentDigit(image, Number(d), left + i * pitch, top, w, h, t));
        Array.from(mm).forEach((d, i) => segmentDigit(image, Number(d), left + i * pitch, top + h + gap, w, h, t));
        return { left, top, w: pitch + w, h: 2 * h + gap, digit: `${w}×${h}, barra ${t}` };
      },
    },
    {
      name: 'hueco',
      ref: 'Apple Watch Numerals Duo (versión de contorno)',
      paint: (image, hh, mm) => {
        const stroke = 3, gap = 14;
        const top = glyphs(fonts.montserrat, hh), bottom = glyphs(fonts.montserrat, mm);
        const h = Math.max(top.inkH, bottom.inkH);
        const blockW = Math.max(top.inkW, bottom.inkW);
        const left = CENTER_X - Math.round(blockW / 2);
        const y0 = CENTER_Y - Math.round((2 * h + gap) / 2);
        for (const [glyph, y] of [[top, y0], [bottom, y0 + h + gap]]) {
          const outline = hollow(glyph.baked, stroke);
          const x = left + Math.round((blockW - glyph.inkW) / 2);
          blitInk(image, { ...glyph, baked: outline }, x, y);
        }
        return { left, top: y0, w: blockW, h: 2 * h + gap, digit: `Montserrat Bold 100 px, contorno ${stroke} px` };
      },
    },
    {
      name: 'bloques',
      ref: 'Game Boy, OP-1 / Playdate (fuente 3×5)',
      paint: (image, hh, mm) => {
        const cell = 11, pitch = 3 * cell + 12, gap = 14;
        const w = 3 * cell, h = 5 * cell;
        const left = CENTER_X - Math.round((pitch + w) / 2);
        const top = CENTER_Y - Math.round((2 * h + gap) / 2);
        Array.from(hh).forEach((d, i) => blockDigit(image, Number(d), left + i * pitch, top, cell));
        Array.from(mm).forEach((d, i) => blockDigit(image, Number(d), left + i * pitch, top + h + gap, cell));
        return { left, top, w: pitch + w, h: 2 * h + gap, digit: `${w}×${h}, celda ${cell}` };
      },
    },
    {
      name: 'fichas',
      ref: 'Split-flap Solari (Gare du Nord)',
      paint: (image, hh, mm) => {
        const tileW = 74, tileH = 84, gapX = 8, gapY = 8;
        const left = CENTER_X - Math.round((2 * tileW + gapX) / 2);
        const top = CENTER_Y - Math.round((2 * tileH + gapY) / 2);
        const rows = [[hh, top], [mm, top + tileH + gapY]];
        for (const [pair, y] of rows) {
          Array.from(pair).forEach((d, i) => {
            const x = left + i * (tileW + gapX);
            image.drawRoundedRect(x, y, tileW, tileH, FAINT, 6);
            const glyph = glyphs(fonts.robotoBold, d);
            blitInk(image, glyph, x + Math.round((tileW - glyph.inkW) / 2), y + Math.round((tileH - glyph.inkH) / 2));
            image.fillRect(x, y + Math.floor(tileH / 2) - 1, tileW, 2, 0);
          });
        }
        return { left, top, w: 2 * tileW + gapX, h: 2 * tileH + gapY, digit: `ficha ${tileW}×${tileH}, Roboto Bold 62 px` };
      },
    },
    {
      name: 'tablero',
      ref: 'Tablero LED de estación (09:30:31), Apple Modular',
      paint: (image, hh, mm, seconds) => {
        const opts = { dot: 6, pitch: 8, radius: 3 };
        const { w, h } = dotSize(opts);
        const pitch = w + 8, colonW = 6, colonGap = 10;
        const blockW = 2 * pitch - 8 + colonGap + colonW + colonGap + 2 * pitch - 8;
        const barH = 2, barGap = 14;
        const blockH = h + barGap + barH;
        const left = CENTER_X - Math.round(blockW / 2);
        const top = CENTER_Y - Math.round(blockH / 2);
        let x = left;
        Array.from(hh).forEach((d, i) => dotDigit(image, Number(d), x + i * pitch, top, opts));
        x += 2 * pitch - 8 + colonGap;
        image.fillRoundedRect(x, top + 2 * opts.pitch, colonW, colonW, DIM, 3);
        image.fillRoundedRect(x, top + 4 * opts.pitch, colonW, colonW, DIM, 3);
        x += colonW + colonGap;
        Array.from(mm).forEach((d, i) => dotDigit(image, Number(d), x + i * pitch, top, opts));
        image.fillRect(left, top + h + barGap, Math.round(blockW * seconds / 60), barH, FAINT);
        return { left, top, w: blockW, h: blockH, digit: `${w}×${h}; barra de minuto ${blockW}×${barH} a ${FAINT}` };
      },
    },
    {
      name: 'horas-grandes',
      ref: 'Casio F-91W (segundos chicos a la derecha), Apple X-Large',
      paint: (image, hh, mm) => {
        const big = { dot: 8, pitch: 11, radius: 3 }, small = { dot: 5, pitch: 7, radius: 2 };
        const B = dotSize(big), S = dotSize(small);
        const bigPitch = B.w + 10, smallPitch = S.w + 7, gap = 12;
        const blockW = bigPitch + B.w + gap + smallPitch + S.w;
        const left = CENTER_X - Math.round(blockW / 2);
        const top = CENTER_Y - Math.round(B.h / 2);
        Array.from(hh).forEach((d, i) => dotDigit(image, Number(d), left + i * bigPitch, top, big));
        const sx = left + bigPitch + B.w + gap, sy = top + B.h - S.h;
        Array.from(mm).forEach((d, i) => dotDigit(image, Number(d), sx + i * smallPitch, sy, small));
        return { left, top, w: blockW, h: B.h, digit: `HH ${B.w}×${B.h}, MM ${S.w}×${S.h}` };
      },
    },
  ];
}

// ---------- output ----------
function png(image, file, tint) {
  const rgba = new Uint8Array(image.width * image.height * 4);
  const levels = new Set();
  for (let i = 0; i < image.pixels.length; i++) {
    const v = graphics.grayToNibble(image.pixels[i]) * 17;
    levels.add(v);
    rgba.set(tint ? [Math.round(v * 0.45), v, Math.round(v * 0.5), 255] : [v, v, v, 255], i * 4);
  }
  assert.ok(levels.size <= 16);
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], image.width, image.height, 0)));
}
function save(band, name) {
  const baked = band.withDrawsBaked();
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(baked, 32, 96);
  png(out, path.join(outDir, `${name}.png`));
  png(baked, path.join(outDir, `${name}-lens.png`), true);
}

/** Lit pixels and summed light (in full-white pixel equivalents) inside the clock block. */
function light(image) {
  let lit = 0, sum = 0;
  for (let y = CLOCK_TOP; y < CLOCK_BOTTOM; y++) for (let x = 0; x < COLUMN_W; x++) {
    const n = graphics.grayToNibble(image.pixels[y * image.width + x]);
    if (n > 0) { lit++; sum += n; }
  }
  return { lit, light: Math.round(sum / 15) };
}
/** Bounding box of lit pixels in a rectangle, or null. */
function inkBox(image, x0, y0, x1, y1) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (image.pixels[y * image.width + x] > 0) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

async function main() {
  pathAwareFontRenderer();
  const face = await stockFont(graphics);
  await adapter.prepareIcons([...new Set([...COLUMN_ICONS, ...CARD_ICONS])].map((n) => ICON_SVGS[n]));
  const fonts = { montserrat: TtfFont.load(ttf('Montserrat-Bold'), 100), robotoBold: TtfFont.load(ttf('Roboto-Bold'), 62) };
  assert.ok(fonts.montserrat && fonts.robotoBold);
  fs.mkdirSync(outDir, { recursive: true });

  const variants = makeVariants(fonts);
  const times = [[9, 41], [22, 7]];
  const report = [];
  const sheetBands = [];
  for (const [index, variant] of variants.entries()) {
    for (const [hh, mm] of times) {
      const now = new Date(2026, 9, 10, hh, mm, 31);
      const data = scenes(now, calendarCardState);
      const home = paintHome(0, data, face);
      // The production block must not touch its neighbours either; the same checks apply to every variant.
      const topRow = inkBox(home, 0, 0, COLUMN_W, CLOCK_TOP), bottomRow = inkBox(home, 0, CLOCK_BOTTOM, COLUMN_W, 288);
      assert.ok(topRow && topRow.maxY < CLOCK_TOP && bottomRow && bottomRow.minY >= CLOCK_BOTTOM);
      const hhmm = `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}`;
      let geometry = null;
      if (variant.paint !== variants[0].paint) {
        home.fillRect(0, CLOCK_TOP, COLUMN_W, CLOCK_BOTTOM - CLOCK_TOP, 0);
        geometry = variant.paint(home, hhmm.slice(0, 2), hhmm.slice(2), now.getSeconds());
      }
      const box = inkBox(home, 0, CLOCK_TOP, COLUMN_W, CLOCK_BOTTOM);
      assert.ok(box && box.maxX < COLUMN_W && box.minY >= CLOCK_TOP && box.maxY < CLOCK_BOTTOM, `${variant.name} ${hhmm} overflows: ${JSON.stringify(box)}`);
      // Nothing of the variant may have landed outside its block (the card starts at 230, the dots at 218).
      assert.ok(!inkBox(home, COLUMN_W, CLOCK_TOP, 218, CLOCK_BOTTOM), `${variant.name} ${hhmm} reaches the dots`);
      const name = `reloj-${index}-${variant.name}-${hhmm}`;
      save(home, name);
      const measure = light(home);
      report.push({ index, name: variant.name, hhmm, ...measure, box, geometry });
      if (hhmm === '0941') sheetBands.push({ index, name: variant.name, band: home });
      console.log(`${name}: lit=${measure.lit} light=${measure.light} ink=[${box.minX},${box.minY}]-[${box.maxX},${box.maxY}]`);
    }
  }

  // Contact sheet: two columns of 09:41 bands, each numbered, tinted like the lens.
  const cols = 2, rows = Math.ceil(sheetBands.length / cols), pad = 16, label = 30;
  const sheet = new graphics.GrayImage(cols * (576 + pad) + pad, rows * (288 + label + pad) + pad);
  sheetBands.forEach(({ index, name, band }, i) => {
    const x = pad + (i % cols) * (576 + pad), y = pad + Math.floor(i / cols) * (288 + label + pad);
    face.drawText(sheet, x, y, `${index}  ${name}`, WHITE);
    sheet.drawRect(x - 1, y + label - 1, 578, 290, FAINT);
    sheet.bitBlt(band, x, y + label);
  });
  png(sheet.withDrawsBaked(), path.join(outDir, 'reloj-sheet-lens.png'), true);
  fs.writeFileSync(path.join(outDir, 'reloj-report.json'), JSON.stringify(report, null, 2));
  const base = report.find((r) => r.index === 0 && r.hhmm === '0941');
  console.log('\nvariant         0941 lit  light  (vs 0)      2207 lit  light');
  for (const variant of variants) {
    const a = report.find((r) => r.name === variant.name && r.hhmm === '0941');
    const b = report.find((r) => r.name === variant.name && r.hhmm === '2207');
    console.log(`${variant.name.padEnd(15)} ${String(a.lit).padStart(8)} ${String(a.light).padStart(6)}  ${(a.light / base.light).toFixed(2)}x      ${String(b.lit).padStart(8)} ${String(b.light).padStart(6)}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
