// Complication layouts for the resting column around the tablero clock, inside
// the production home: paintHome paints the card, then the whole column
// (x 0–212) is cleared and repainted. Run from this folder:
//   node complicaciones.cjs
// Writes out/comp-<n>-<name>-<hhmm>(-lens).png and out/comp-sheet-lens.png.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
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
const COLUMN_W = 212, ICON = 20, ICON_GAP = 5, TOP_ROW = 12, BOTTOM_ROW = 248, CENTER_X = 106;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
const DEGREE = ['010', '101', '010'];

function dotGlyph(image, rows, x, y, dot, pitch, value, radius) {
  rows.forEach((row, dy) => Array.from(row).forEach((on, dx) => {
    if (on === '1') {
      if (radius) image.fillRoundedRect(x + dx * pitch, y + dy * pitch, dot, dot, value, radius);
      else image.fillRect(x + dx * pitch, y + dy * pitch, dot, dot, value);
    }
  }));
}

/** Small dot-matrix number (digits and °) at dot 2 / pitch 3: 14×20 per digit, the clock's grid at a third. */
function dotNumber(image, text, x, y, value = WHITE) {
  const dot = 2, pitch = 3;
  let cx = x;
  for (const ch of text) {
    if (ch === '°') { dotGlyph(image, DEGREE, cx, y, dot, pitch, value, 0); cx += 3 * pitch + 3; continue; }
    dotGlyph(image, DOTS_5x7[Number(ch)], cx, y, dot, pitch, value, 0);
    cx += 5 * pitch + 3;
  }
  return cx - x - 3;
}
const dotNumberWidth = (text) => Array.from(text).reduce((w, ch) => w + (ch === '°' ? 12 : 18), 0) - 3;

/** The tablero clock; `bar` (0–1 or null) is the line under the digits. Returns the block's box. */
function tablero(image, hh, mm, centerY, bar) {
  const opts = { dot: 6, pitch: 8, radius: 3 };
  const w = 4 * opts.pitch + opts.dot, h = 6 * opts.pitch + opts.dot;
  const pitch = w + 8, colonW = 6, colonGap = 10;
  const blockW = 2 * pitch - 8 + colonGap + colonW + colonGap + 2 * pitch - 8;
  const barH = 2, barGap = 14;
  const blockH = bar === null ? h : h + barGap + barH;
  const left = CENTER_X - Math.round(blockW / 2);
  const top = centerY - Math.round(blockH / 2);
  let x = left;
  Array.from(hh).forEach((d, i) => dotGlyph(image, DOTS_5x7[Number(d)], x + i * pitch, top, opts.dot, opts.pitch, WHITE, opts.radius));
  x += 2 * pitch - 8 + colonGap;
  image.fillRoundedRect(x, top + 2 * opts.pitch, colonW, colonW, DIM, 3);
  image.fillRoundedRect(x, top + 4 * opts.pitch, colonW, colonW, DIM, 3);
  x += colonW + colonGap;
  Array.from(mm).forEach((d, i) => dotGlyph(image, DOTS_5x7[Number(d)], x + i * pitch, top, opts.dot, opts.pitch, WHITE, opts.radius));
  if (bar !== null) {
    image.fillRect(left, top + h + barGap, blockW, barH, 17);
    image.fillRect(left, top + h + barGap, Math.round(blockW * Math.max(0, Math.min(1, bar))), barH, FAINT);
  }
  return { left, top, w: blockW, h: blockH, digitsBottom: top + h };
}

function gauge(level) {
  const outline = renderIcon('battery', ICON);
  const filled = outline.clone();
  const inner = Math.round(9 * level / 100);
  if (inner) filled.fillRect(4, 8, inner, 5, WHITE);
  return filled;
}

function makeKit(image, face) {
  const iconDy = Math.round((face.lineHeight - ICON) / 2);
  const icon = (name, x, y, value = WHITE) => {
    const art = renderIcon(name, ICON);
    image.drawImage(value === WHITE ? art : art.dimmed(value / 255), x, y + iconDy);
  };
  const text = (x, y, s, value = WHITE) => face.drawText(image, x, y, s, value);
  const complication = (x, y, name, s, align = 'left', value = WHITE) => {
    const width = ICON + ICON_GAP + face.measureLine(s);
    const left = align === 'left' ? x : x - width;
    icon(name, left, y, value);
    text(left + ICON + ICON_GAP, y, s, value);
    return width;
  };
  const batteries = (y) => {
    for (const [x, name, level] of [[COLUMN_W - 98, 'circle', 72], [COLUMN_W - 44, 'glasses', 88]]) {
      icon(name, x, y);
      image.drawImage(gauge(level), x + ICON + 3, y + iconDy);
    }
  };
  const fit = (s, width) => {
    if (face.measureLine(s) <= width) return s;
    while (s.length > 1 && face.measureLine(`${s}…`) > width) s = s.slice(0, -1).trimEnd();
    return `${s}…`;
  };
  return { icon, text, complication, batteries, fit, measure: (s) => face.measureLine(s), iconDy };
}

// Each variant paints the whole column from a scene `s`.
const VARIANTS = [
  {
    name: 'actual',
    note: 'Tablero con las complicaciones de hoy: día, anillo y lentes arriba; clima y Paseo abajo.',
    paint(image, k, s) {
      k.complication(0, TOP_ROW, 'calendar', s.day);
      k.batteries(TOP_ROW);
      tablero(image, s.hh, s.mm, 142, s.seconds / 60);
      k.complication(0, BOTTOM_ROW, s.weatherIcon, s.temp);
      k.complication(COLUMN_W, BOTTOM_ROW, 'square-terminal', String(s.needs), 'right');
    },
  },
  {
    name: 'andén',
    note: 'Tablero de estación: debajo del reloj la próxima reunión (hora en blanco, título tenue). La barra es la cuenta atrás de la última hora antes de la reunión; cambia una vez por minuto.',
    paint(image, k, s) {
      k.complication(0, TOP_ROW, 'calendar', s.day);
      k.batteries(TOP_ROW);
      const clock = tablero(image, s.hh, s.mm, 128, s.nextBar);
      const y = clock.top + clock.h + 14;
      const tw = k.measure(s.nextTime);
      const left = clock.left;
      k.text(left, y, s.nextTime);
      k.text(left + tw + 8, y, k.fit(s.nextTitle, clock.left + clock.w - left - tw - 8), DIM);
      k.complication(0, BOTTOM_ROW, s.weatherIcon, s.temp);
      k.complication(COLUMN_W, BOTTOM_ROW, 'square-terminal', String(s.needs), 'right');
    },
  },
  {
    name: 'callado',
    note: 'Lo mínimo: arriba el día y el clima en una línea tenue, sin iconos. Abajo solo lo que pide algo (Paseo) y la batería solo cuando baja de 20 %. Sin barra.',
    paint(image, k, s) {
      k.text(0, TOP_ROW, `${s.day}  ·  ${s.temp}`, DIM);
      tablero(image, s.hh, s.mm, 142, null);
      if (s.lowGlasses !== null) k.complication(0, BOTTOM_ROW, 'glasses', `${s.lowGlasses}%`);
      if (s.needs) k.complication(COLUMN_W, BOTTOM_ROW, 'square-terminal', String(s.needs), 'right');
    },
  },
  {
    name: 'puntos',
    note: 'Las cuatro esquinas de hoy, pero los números en la misma retícula de puntos del reloj (un tercio del tamaño). El icono hace de etiqueta.',
    paint(image, k, s) {
      const dy = k.iconDy;
      const corner = (name, value, x, y, align) => {
        const width = ICON + 6 + dotNumberWidth(value);
        const left = align === 'left' ? x : x - width;
        k.icon(name, left, y);
        dotNumber(image, value, left + ICON + 6, y + dy);
      };
      corner('calendar', String(s.date), 0, TOP_ROW, 'left');
      corner('glasses', String(s.glasses), COLUMN_W, TOP_ROW, 'right');
      tablero(image, s.hh, s.mm, 142, null);
      corner(s.weatherIcon, s.temp, 0, BOTTOM_ROW, 'left');
      corner('square-terminal', String(s.needs), COLUMN_W, BOTTOM_ROW, 'right');
    },
  },
  {
    name: 'agenda',
    note: 'Apple Modular: debajo del reloj las dos próximas cosas del día, como un tablero de salidas. Arriba día y Paseo; el clima y las baterías salen de la columna.',
    paint(image, k, s) {
      k.complication(0, TOP_ROW, 'calendar', s.day);
      k.complication(COLUMN_W, TOP_ROW, 'square-terminal', String(s.needs), 'right');
      const clock = tablero(image, s.hh, s.mm, 116, null);
      let y = clock.top + clock.h + 34;
      const tw = Math.max(...s.agenda.map(([t]) => k.measure(t)));
      for (const [t, title] of s.agenda) {
        k.text(0, y, t, DIM);
        k.text(tw + 10, y, k.fit(title, COLUMN_W - tw - 10), y === clock.top + clock.h + 34 ? WHITE : DIM);
        y += 27;
      }
    },
  },
  {
    name: 'medidores',
    note: 'Garmin: las baterías dejan de ser iconos de pila y pasan a ser dos barras finas con su número, debajo del reloj. Arriba día y clima; Paseo abajo a la derecha.',
    paint(image, k, s) {
      k.complication(0, TOP_ROW, 'calendar', s.day);
      k.complication(COLUMN_W, TOP_ROW, s.weatherIcon, s.temp, 'right');
      const clock = tablero(image, s.hh, s.mm, 124, null);
      let y = clock.top + clock.h + 22;
      for (const [name, level] of [['circle', 72], ['glasses', s.glasses]]) {
        k.icon(name, 0, y, DIM);
        const barX = ICON + 8, barW = 120, barY = y + k.iconDy + 8;
        image.fillRect(barX, barY, barW, 4, 34);
        image.fillRect(barX, barY, Math.round(barW * level / 100), 4, level < 20 ? WHITE : DIM);
        k.text(barX + barW + 10, y, `${level}`, DIM);
        y += 26;
      }
      k.complication(COLUMN_W, BOTTOM_ROW, 'square-terminal', String(s.needs), 'right');
    },
  },
];

function sceneFor(now, glasses) {
  const data = scenes(now, calendarCardState);
  const isDay = data.weather.isDay;
  const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
  const morning = now.getHours() < 12;
  // 09:41 is 49 min before the 10:30 daily; at 22:07 the next thing is tomorrow's dentist.
  const minutesToNext = morning ? (10 * 60 + 30) - (now.getHours() * 60 + now.getMinutes()) : null;
  return {
    data, hh, mm, seconds: now.getSeconds(),
    day: `${WEEKDAY[now.getDay()]} ${now.getDate()}`, date: now.getDate(),
    temp: `${Math.round(data.weather.temperatureC)}°`,
    weatherIcon: data.weather.code === 0 ? (isDay ? 'sun' : 'moon') : (isDay ? 'cloud-sun' : 'cloud-moon'),
    needs: data.paseo.needs,
    glasses, lowGlasses: glasses < 20 ? glasses : null,
    nextTime: morning ? '10:30' : 'Sun 9:00',
    nextTitle: morning ? 'Daily con el equipo' : 'Dentista',
    nextBar: minutesToNext === null ? 0 : 1 - minutesToNext / 60,
    agenda: morning
      ? [['10:30', 'Daily con el equipo'], ['14:00', 'Revisión del plan de soporte']]
      : [['Sun 9:00', 'Dentista']],
  };
}

function png(image, file, tint) {
  const rgba = new Uint8Array(image.width * image.height * 4);
  for (let i = 0; i < image.pixels.length; i++) {
    const v = graphics.grayToNibble(image.pixels[i]) * 17;
    rgba.set(tint ? [Math.round(v * 0.45), v, Math.round(v * 0.5), 255] : [v, v, v, 255], i * 4);
  }
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], image.width, image.height, 0)));
}
function inkBox(image, x0, y0, x1, y1) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (image.pixels[y * image.width + x] > 0) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

async function main() {
  const face = await stockFont(graphics);
  await adapter.prepareIcons([...new Set([...COLUMN_ICONS, ...CARD_ICONS])].map((n) => ICON_SVGS[n]));
  fs.mkdirSync(outDir, { recursive: true });
  const sheet = [];
  for (const [index, variant] of VARIANTS.entries()) {
    // The evening scene runs the glasses low so the variants that only show a weak battery have something to show.
    for (const [hh, mm, glasses] of [[9, 41, 88], [22, 7, 14]]) {
      const now = new Date(2026, 9, 10, hh, mm, 31);
      const s = sceneFor(now, glasses);
      const home = paintHome(0, s.data, face);
      home.fillRect(0, 0, COLUMN_W, 288, 0);
      const band = home.withDrawsBaked();
      variant.paint(band, makeKit(band, face), s);
      const baked = band.withDrawsBaked();
      assert.ok(!inkBox(baked, COLUMN_W, 0, 218, 118), `${variant.name} reaches the dots`);
      const box = inkBox(baked, 0, 0, COLUMN_W, 288);
      assert.ok(box.maxX < COLUMN_W && box.maxY < 288, `${variant.name} overflows ${JSON.stringify(box)}`);
      const name = `comp-${index}-${variant.name}-${s.hh}${s.mm}`;
      const out = new graphics.GrayImage(640, 480);
      out.bitBlt(baked, 32, 96);
      png(out, path.join(outDir, `${name}.png`));
      png(baked, path.join(outDir, `${name}-lens.png`), true);
      if (hh === 9) sheet.push({ index, name: variant.name, band: baked });
      console.log(`${name}: ink=[${box.minX},${box.minY}]-[${box.maxX},${box.maxY}]`);
    }
  }
  const cols = 2, pad = 16, label = 30;
  const rows = Math.ceil(sheet.length / cols);
  const contact = new graphics.GrayImage(cols * (576 + pad) + pad, rows * (288 + label + pad) + pad);
  sheet.forEach(({ index, name, band }, i) => {
    const x = pad + (i % cols) * (576 + pad), y = pad + Math.floor(i / cols) * (288 + label + pad);
    face.drawText(contact, x, y, `${index}  ${name}`, WHITE);
    contact.drawRect(x - 1, y + label - 1, 578, 290, FAINT);
    contact.bitBlt(band, x, y + label);
  });
  png(contact.withDrawsBaked(), path.join(outDir, 'comp-sheet-lens.png'), true);
  fs.writeFileSync(path.join(outDir, 'comp-notes.json'), JSON.stringify(VARIANTS.map((v, i) => ({ index: i, name: v.name, note: v.note })), null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
