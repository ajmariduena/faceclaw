const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const LUCIDE = process.env.LUCIDE_DIR ?? '/tmp/lucide-pkg/package/icons';
const context = createRenderContext();
const { graphics, TtfFont, adapter, load } = context;
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const { ICON_SVGS } = load('app/graphics/icons.ts');
const root = path.resolve(__dirname, '../..');
const ttf = (name) => path.join(root, 'app/fonts/ttf', `${name}.ttf`);

// The render adapter registers Roboto Light only; the clock options need the other bundled faces too.
function pathAwareFontRenderer() {
  const families = new Map();
  const family = (file) => {
    if (!families.has(file)) {
      const name = `Clock-${path.basename(file, '.ttf')}`;
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

function save(band, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', `${name}.png`), Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  console.log(name);
}

const COLUMN = 212;
const DIM = 153;

// Battery gauge: the Lucide battery outline with its body filled to the level (Apple Watch corner gauge, flattened).
function batteryGauge(svgIcon, level) {
  const image = svgIcon('battery', 20);
  const inner = Math.round(9 * level);
  if (inner) image.fillRect(4, 8, inner, 5, 255);
  return image;
}

// Four corner complications, Apple Watch style: a Lucide icon and the stock UI face.
function complications(image, face, svgIcon, state, { top = 12, bottom = 248 } = {}) {
  const iconDy = Math.round((face.lineHeight - 20) / 2);
  const complication = (x, y, name, text, align = 'left') => {
    const width = 20 + 5 + face.measureLine(text);
    const left = align === 'left' ? x : x - width;
    image.drawImage(svgIcon(name, 20), left, y + iconDy);
    face.drawText(image, left + 25, y, text, 255);
    return width;
  };
  complication(0, top, 'calendar', state.day);
  const gauge = (x, name, level) => {
    image.drawImage(svgIcon(name, 20), x, top + iconDy);
    image.drawImage(batteryGauge(svgIcon, level), x + 23, top + iconDy);
  };
  gauge(COLUMN - 44, 'glasses', state.glasses);
  gauge(COLUMN - 44 - 54, 'circle', state.ring);
  complication(0, bottom, 'cloud-sun', state.temp);
  complication(COLUMN, bottom, 'square-terminal', String(state.needs), 'right');
}

// Modular layout: larger complications (Roboto Light, 24 px icons) in two rows around a one-line clock.
function modularComplications(image, font, svgIcon, state) {
  const iconDy = Math.round((font.ascent - 24) / 2) + 2;
  const draw = (x, y, name, text, align = 'left') => {
    const width = 24 + 6 + Math.round(font.measureText(text));
    const left = align === 'left' ? x : x - width;
    image.drawImage(svgIcon(name, 24), left, y + iconDy);
    font.drawText(image, left + 30, y, text, 255);
  };
  draw(0, 6, 'calendar', state.day);
  draw(COLUMN, 6, 'cloud-sun', state.temp, 'right');
  const gauge = (x, y, name, level) => {
    image.drawImage(svgIcon(name, 24), x, y);
    const battery = svgIcon('battery', 24);
    const inner = Math.round(11 * level);
    if (inner) battery.fillRect(5, 10, inner, 5, 255);
    image.drawImage(battery, x + 28, y);
  };
  const y = 244;
  gauge(0, y + iconDy, 'circle', state.ring);
  gauge(72, y + iconDy, 'glasses', state.glasses);
  draw(COLUMN, y, 'square-terminal', String(state.needs), 'right');
}

// Option A — "dot-grid": a dot matrix sampled from Roboto Bold, so the digits keep real typographic
// proportions and the dots stay round, stacked HH over MM and centred in the column.
function dotGridClock(image, hh, mm, boldFont, pitch = 6, dot = 4, threshold = 100) {
  const render = (text) => {
    const width = Math.ceil(boldFont.measureText(text)) + 8;
    const scratch = new graphics.GrayImage(width, boldFont.lineHeight + 8);
    boldFont.drawText(scratch, 4, 4, text, 255);
    const baked = scratch.withDrawsBaked();
    const cols = Math.floor(baked.width / pitch), rows = Math.floor(baked.height / pitch);
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let y = 0; y < pitch; y++) for (let x = 0; x < pitch; x++) sum += baked.pixels[(r * pitch + y) * baked.width + c * pitch + x];
      if (sum / (pitch * pitch) > threshold) cells.push([c, r]);
    }
    const minC = Math.min(...cells.map(([c]) => c)), maxC = Math.max(...cells.map(([c]) => c));
    const minR = Math.min(...cells.map(([, r]) => r)), maxR = Math.max(...cells.map(([, r]) => r));
    const out = new graphics.GrayImage((maxC - minC + 1) * pitch, (maxR - minR + 1) * pitch);
    for (const [c, r] of cells) {
      const x = (c - minC) * pitch, y = (r - minR) * pitch;
      out.fillRect(x + 1, y, dot - 2, dot, 255);
      out.fillRect(x, y + 1, dot, dot - 2, 255);
    }
    return out;
  };
  const top = render(hh), bottom = render(mm);
  const gap = 14;
  const total = top.height + gap + bottom.height;
  const y0 = 44 + Math.round((198 - total) / 2);
  image.drawImage(top, Math.round((COLUMN - top.width) / 2), y0);
  image.drawImage(bottom, Math.round((COLUMN - bottom.width) / 2), y0 + top.height + gap);
}

// Option B — "thin-duo": Inter Light stacked numerals, hours bright and minutes dimmed a step.
function thinDuoClock(image, hh, mm, thinFont) {
  const capTop = Math.round(thinFont.ascent * 0.27);
  const capHeight = Math.round(thinFont.ascent * 0.73);
  const gap = 22;
  const y0 = 44 + Math.round((198 - (capHeight * 2 + gap)) / 2) - capTop;
  for (const [text, y, value] of [[hh, y0, 255], [mm, y0 + capHeight + gap, 204]]) {
    thinFont.drawText(image, Math.round((COLUMN - thinFont.measureText(text)) / 2), y, text, value);
  }
}

// Option C — "modular": one bold line "HH:MM" with a hairline under it, and larger bottom complications.
function modularClock(image, hh, mm, boldFont) {
  const text = `${hh}:${mm}`;
  const width = boldFont.measureText(text);
  const x = Math.round((COLUMN - width) / 2);
  const capTop = Math.round(boldFont.ascent * 0.29);
  const capHeight = Math.round(boldFont.ascent * 0.71);
  const y = 40 + Math.round((200 - capHeight) / 2);
  boldFont.drawText(image, x, y - capTop, text, 255);
  image.fillRect(x, y + capHeight + 16, Math.round(width), 1, DIM);
  image.fillRect(x, y - 17, Math.round(width), 1, DIM);
}

async function main() {
  pathAwareFontRenderer();
  const face = await stockFont(graphics);
  const horizonFont = TtfFont.load(adapter.fontPath, 80);
  const clockFace = { lineHeight: horizonFont.lineHeight, measureLine: (t) => horizonFont.measureText(t), drawText: (...a) => horizonFont.drawText(...a) };
  const lucideNames = ['calendar', 'circle', 'glasses', 'battery', 'cloud-sun', 'square-terminal'];
  const svgs = { ...ICON_SVGS };
  for (const name of lucideNames) if (!svgs[name]) svgs[name] = fs.readFileSync(path.join(LUCIDE, `${name}.svg`), 'utf8');
  const cardIcons = ['cloud-sun', 'square-terminal', 'calendar-days', 'languages', 'messages-square', 'layout-grid'];
  await adapter.prepareIcons([...new Set([...cardIcons, ...lucideNames].map((n) => svgs[n]))]);
  const svgIcon = (name, size) => adapter.rasterizeSvg(svgs[name], size, 2, graphics.GrayImage);

  const dotFont = TtfFont.load(ttf('Roboto-Bold'), 112);
  const thinFont = TtfFont.load(ttf('Inter_18pt-Light'), 100);
  const modularFont = TtfFont.load(ttf('Montserrat-Bold'), 66);
  const modularComplicationFont = TtfFont.load(ttf('Roboto-Light'), 26);

  const at = (h, m) => new Date(2026, 9, 10, h, m);
  const paseoAt = (now) => ({ configured: true, status: '', needs: 2, working: 1, updates: [
    { agentId: 'a', title: 'Fix reconnect after BLE drop', bucket: 'needs-input', activityMs: now.getTime() - 60_000, line: '¿Apruebas correr los tests de BLE?' },
    { agentId: 'b', title: 'Revisar PR #1221 jelou-cli', bucket: 'ready', activityMs: now.getTime() - 240_000, line: 'Listo para fusionar a producción.' },
  ] });
  const calendarAt = (now) => calendarCardState(true, [
    { title: 'Daily con el equipo', startMs: at(10, 30).getTime(), endMs: at(11, 0).getTime(), allDay: false },
    { title: 'Revisión del plan de soporte', startMs: at(14, 0).getTime(), endMs: at(15, 0).getTime(), allDay: false },
  ], now.getTime());
  const state = { day: 'Sat 10', ring: 0.72, glasses: 0.88, temp: '27°', needs: 2 };

  const options = {
    'dot-grid': (image, hh, mm) => { complications(image, face, svgIcon, state); dotGridClock(image, hh, mm, dotFont); },
    'thin-duo': (image, hh, mm) => { complications(image, face, svgIcon, state); thinDuoClock(image, hh, mm, thinFont); },
    modular: (image, hh, mm) => { modularComplications(image, modularComplicationFont, svgIcon, state); modularClock(image, hh, mm, modularFont); },
  };
  for (const [name, paint] of Object.entries(options)) {
    for (const [hh, mm] of [['09', '41'], ['22', '07']]) {
      const now = at(Number(hh), Number(mm));
      const home = paintHome(0, { now, calendar: calendarAt(now), paseo: paseoAt(now), translateReady: true }, face, clockFace);
      home.fillRect(0, 0, 214, 288, 0);
      paint(home, hh, mm);
      save(home, `home-clock-fable-${name}-${hh}${mm}`);
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
