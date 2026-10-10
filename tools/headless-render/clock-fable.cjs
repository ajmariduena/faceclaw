const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const only = process.argv.slice(2);
process.argv.length = 2;
process.env.NODE_PATH = path.join(__dirname, 'node_modules');
require('node:module').Module._initPaths();
const UPNG = require('upng-js');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const art = require('./stock-art.cjs');

const root = path.resolve(__dirname, '../..');
const ttfDir = path.join(root, 'app/fonts/ttf');
const faces = {
  robotoLight: path.join(ttfDir, 'Roboto-Light.ttf'),
  robotoRegular: path.join(ttfDir, 'Roboto-Regular.ttf'),
  montserratLight: path.join(ttfDir, 'Montserrat-Light.ttf'),
  montserratRegular: path.join(ttfDir, 'Montserrat-Regular.ttf'),
};

function faceRenderer(ttfPath) {
  const family = `ClockFable-${path.basename(ttfPath, '.ttf')}`;
  assert.ok(GlobalFonts.registerFromPath(ttfPath, family), `${ttfPath} must load`);
  const contexts = new Map();
  const context = (size) => {
    if (!contexts.has(size)) {
      const ctx = createCanvas(size * 4, size * 4).getContext('2d');
      ctx.font = `${size}px ${family}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff';
      contexts.set(size, ctx);
    }
    return contexts.get(size);
  };
  const metrics = (size) => {
    const m = context(size).measureText('Hg');
    return [Math.ceil(m.fontBoundingBoxAscent), Math.ceil(m.fontBoundingBoxDescent)];
  };
  return {
    getFontMetrics: (size) => [...metrics(size), 0].join(' '),
    measureTextExact: (text, size) => context(size).measureText(text).width,
    renderGlyphCell: (size, cp, gamma) => {
      const ctx = context(size);
      const text = String.fromCodePoint(cp);
      const m = ctx.measureText(text);
      const [ascent] = metrics(size);
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
    },
  };
}

const dotRows = {
  '0': ['..#######..', '.#########.', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '.#########.', '..#######..'],
  '1': ['.....##....', '....###....', '...####....', '..##.##....', '.##..##....', '.....##....', '.....##....', '.....##....', '.....##....', '.....##....', '.....##....', '.....##....', '.....##....', '.....##....', '..#########', '..#########'],
  '2': ['..#######..', '.#########.', '##.......##', '##.......##', '.........##', '.........##', '........##.', '.......##..', '......##...', '.....##....', '....##.....', '...##......', '..##.......', '.##........', '###########', '###########'],
  '3': ['..#######..', '.#########.', '##.......##', '.........##', '.........##', '.........##', '....######.', '....######.', '.........##', '.........##', '.........##', '.........##', '##.......##', '##.......##', '.#########.', '..#######..'],
  '4': ['.......##..', '......###..', '.....####..', '....##.##..', '...##..##..', '..##...##..', '.##....##..', '##.....##..', '##.....##..', '###########', '###########', '.......##..', '.......##..', '.......##..', '.......##..', '.......##..'],
  '5': ['###########', '###########', '##.........', '##.........', '##.........', '##.........', '##.######..', '###########', '.........##', '.........##', '.........##', '.........##', '##.......##', '##.......##', '.#########.', '..#######..'],
  '6': ['..#######..', '.#########.', '##.......##', '##.......##', '##.........', '##.........', '##.######..', '###########', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '.#########.', '..#######..'],
  '7': ['###########', '###########', '.........##', '.........##', '........##.', '........##.', '.......##..', '.......##..', '......##...', '......##...', '.....##....', '.....##....', '....##.....', '....##.....', '...##......', '...##......'],
  '8': ['..#######..', '.#########.', '##.......##', '##.......##', '##.......##', '##.......##', '.#########.', '.#########.', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '.#########.', '..#######..'],
  '9': ['..#######..', '.#########.', '##.......##', '##.......##', '##.......##', '##.......##', '##.......##', '###########', '..######.##', '.........##', '.........##', '.........##', '##.......##', '##.......##', '.#########.', '..#######..'],
};

const states = {
  next: { start: '10:30', title: 'Daily con el equipo de producto', when: 'en 49 min' },
  now: { start: '10:30', end: '11:00', title: 'Daily con el equipo de producto', now: true },
  tomorrow: { start: '09:30', title: 'Planificación semanal', tomorrow: true },
  2227: { start: '22:52', title: 'Daily con el equipo de producto', when: 'en 25 min', clock: '22:27' },
};
const DATE = 'Miércoles 7 oct';
const WHITE = 255, GRAY = 153, DIM = 85, FAINT = 68;

async function main() {
  const context = createRenderContext();
  const { graphics, rect, TtfFont, adapter } = context;
  const renderers = new Map();
  const rendererFor = (p) => {
    if (!renderers.has(p)) renderers.set(p, faceRenderer(p === adapter.fontPath ? faces.robotoLight : p));
    return renderers.get(p);
  };
  Object.assign(adapter.fontRenderer, {
    getFontMetrics: (p, size) => rendererFor(p).getFontMetrics(size),
    measureTextExact: (p, text, size) => rendererFor(p).measureTextExact(text, size),
    renderGlyphCell: (p, size, cp, gamma) => rendererFor(p).renderGlyphCell(size, cp, gamma),
  });
  const face = await stockFont(graphics);
  const blank = (w = 576, h = 288) => new graphics.GrayImage(w, h);

  const text = (image, x, y, label, value = WHITE, width = image.width - x) => {
    for (const char of label) assert.ok(char === ' ' || face.hasGlyph(char.codePointAt(0)), `Missing stock glyph: ${char}`);
    assert.ok(face.measureLine(label) <= width, `Text overflow: ${label} (${face.measureLine(label)} > ${width})`);
    assert.ok(y >= 0 && y + face.lineHeight <= image.height + 4, `Line outside image: ${label}`);
    face.drawText(image, x, y, label, value);
  };
  const ellipsize = (label, width) => {
    if (face.measureLine(label) <= width) return label;
    let chars = Array.from(label);
    while (chars.length && face.measureLine(chars.join('').trimEnd() + '…') > width) chars = chars.slice(0, -1);
    return chars.join('').trimEnd() + '…';
  };
  const wrapLines = (label, width, maxLines) => {
    const lines = face.wrap(label, width);
    if (lines.length <= maxLines) return lines;
    const head = lines.slice(0, maxLines - 1);
    return [...head, ellipsize(lines.slice(maxLines - 1).join(' '), width)];
  };
  const icon = (image, name, x, y, size = 24, value = WHITE) => image.drawImage(art.icon(graphics, name, size).dimmed(value / 255), x, y);

  const inkCache = new Map();
  function ink(font, label, value = WHITE) {
    const key = `${font.atlasKey}|${label}|${value}`;
    if (inkCache.has(key)) return inkCache.get(key);
    const w = Math.ceil(font.measureText(label)) + 8, h = font.lineHeight + 8;
    const scratch = blank(w, h);
    scratch.drawText(font, 4, 4, label, value);
    const baked = scratch.withDrawsBaked();
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (baked.pixels[y * w + x] > 8) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    assert.ok(maxX >= 0, `No ink: ${label}`);
    const out = blank(maxX - minX + 1, maxY - minY + 1);
    out.bitBlt(baked, 0, 0, { sx: minX, sy: minY, width: out.width, height: out.height });
    inkCache.set(key, out);
    return out;
  }
  const ttf = (file, size) => {
    const font = TtfFont.load(file, size);
    assert.ok(font, `TTF must load: ${file} @ ${size}`);
    return font;
  };

  function dotDigit(char, dot = 3, pitch = 4, value = WHITE) {
    const rows = dotRows[char];
    assert.ok(rows, `Unknown dot digit: ${char}`);
    const cols = rows[0].length;
    const image = blank(cols * pitch - (pitch - dot), rows.length * pitch - (pitch - dot));
    rows.forEach((row, y) => Array.from(row).forEach((cell, x) => {
      if (cell === '#') image.fillRect(x * pitch, y * pitch, dot, dot, value);
    }));
    return image;
  }

  function musicCard(w) {
    const image = blank(w, 260);
    image.drawRoundedRect(0, 0, w, 260, WHITE, 6);
    icon(image, 'music', 20, 18);
    text(image, 52, 16, 'Música', WHITE, w - 72);
    text(image, 20, 69, 'Hasta la raíz', WHITE, w - 40);
    text(image, 20, 96, 'Natalia Lafourcade', GRAY, w - 40);
    text(image, 20, 139, 'Sonando', GRAY, w - 40);
    const bar = w - 40;
    image.fillRect(20, 188, bar, 2, FAINT);
    image.fillRect(20, 188, Math.round(bar * 118 / 278), 2, WHITE);
    text(image, 20, 202, '1:42', GRAY, 70);
    text(image, w - 20 - face.measureLine('4:20'), 202, '4:20', GRAY, 70);
    const mid = Math.round(w / 2);
    image.fillRect(mid - 7, 211, 3, 12, WHITE);
    image.fillRect(mid + 2, 211, 3, 12, WHITE);
    return image.withDrawsBaked();
  }
  function rightSide(image, cardX, cardW) {
    image.bitBlt(musicCard(cardW), cardX, 14);
    for (let i = 0; i < 5; i++) image.fillRect(cardX - 12, 120 + i * 11, i === 1 ? 4 : 2, 3, i === 1 ? WHITE : DIM);
  }

  function eventLines(state) {
    if (state.tomorrow) return { head: null, lines: [['Hoy libre', GRAY], [`Mañana ${state.start}`, WHITE]] };
    if (state.now) return { head: ['Ahora', `hasta ${state.end}`], lines: [] };
    return { head: [state.start, state.when], lines: [] };
  }

  function designA(state) {
    const clock = state.clock || '09:41';
    const image = blank();
    const column = 196;
    const time = ink(ttf(faces.robotoLight, 78), clock);
    image.drawImage(time, 20, 22);
    text(image, 22, 94, DATE, GRAY, column);
    const left = 22;
    let y = 150;
    const { head, lines } = eventLines(state);
    if (head) {
      const barValue = state.now ? WHITE : GRAY;
      const [a, b] = head;
      text(image, left + 14, y, a, WHITE, column - 14);
      text(image, left + 14 + face.measureLine(a) + 10, y, b, GRAY, column - 14);
      const titleLines = wrapLines(state.title, column - 14, 2);
      titleLines.forEach((line, i) => text(image, left + 14, y + 27 * (i + 1), line, WHITE, column - 14));
      const height = 27 * (titleLines.length + 1) - 5;
      image.fillRect(left, y + 3, state.now ? 4 : 2, height, barValue);
    } else {
      lines.forEach(([label, value], i) => text(image, left, y + 27 * i, label, value, column));
      text(image, left, y + 54, ellipsize(state.title, column), GRAY, column);
    }
    rightSide(image, 230, 318);
    return image;
  }

  function designB(state) {
    const clock = state.clock || '09:41';
    const image = blank();
    const column = 196;
    text(image, 22, 10, DATE, GRAY, column);
    const [hh, mm] = clock.split(':');
    const sample = dotDigit('0', 3, 5);
    const digitW = sample.width, digitH = sample.height, gap = 12;
    [[hh, 42], [mm, 42 + digitH + 8]].forEach(([pair, y]) => {
      Array.from(pair).forEach((char, i) => image.drawImage(dotDigit(char, 3, 5), 22 + i * (digitW + gap), y));
    });
    const y = 222;
    const { head, lines } = eventLines(state);
    if (head) {
      const [a, b] = head;
      if (state.now) {
        image.fillRoundedRect(20, y + 1, face.measureLine(a) + 16, 24, WHITE, 4);
        text(image, 28, y, a, 0, column);
        text(image, 20 + face.measureLine(a) + 24, y, b, GRAY, column);
      } else {
        text(image, 22, y, a, WHITE, column);
        text(image, 22 + face.measureLine(a) + 10, y, b, GRAY, column);
      }
      text(image, 22, y + 27, ellipsize(state.title, column), WHITE, column);
    } else {
      text(image, 22, y, lines[1][0], lines[1][1], column);
      text(image, 22, y + 27, ellipsize(state.title, column), GRAY, column);
    }
    rightSide(image, 230, 318);
    return image;
  }

  function designC(state) {
    const clock = state.clock || '09:41';
    const image = blank();
    const cardX = 300, cardW = 268;
    const column = cardX - 12 - 22 - 20;
    const time = ink(ttf(faces.montserratRegular, 88), clock);
    image.drawImage(time, 20, 20);
    text(image, 22, 104, DATE, GRAY, column + 20);
    const box = { x: 22, y: 152, w: column + 20, h: 116 };
    image.drawRoundedRect(box.x, box.y, box.w, box.h, state.now ? WHITE : 102, 8);
    const left = box.x + 14, inner = box.w - 28;
    let y = box.y + 12;
    const { head, lines } = eventLines(state);
    if (head) {
      const [a, b] = head;
      if (state.now) {
        image.fillRoundedRect(left - 2, y + 1, face.measureLine(a) + 16, 24, WHITE, 4);
        text(image, left + 6, y, a, 0, inner);
        text(image, left + face.measureLine(a) + 22, y, b, GRAY, inner);
      } else {
        text(image, left, y, a, WHITE, inner);
        text(image, left + face.measureLine(a) + 10, y, b, GRAY, inner);
      }
      wrapLines(state.title, inner, 2).forEach((line, i) => text(image, left, y + 27 * (i + 1), line, state.now ? WHITE : GRAY, inner));
    } else {
      lines.forEach(([label, value], i) => text(image, left, y + 27 * i, label, value, inner));
      text(image, left, y + 54, ellipsize(state.title, inner), GRAY, inner);
    }
    rightSide(image, cardX, cardW);
    return image;
  }

  const designs = { a: designA, b: designB, c: designC };
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  const written = [];
  const sheet = blank(576 * 3 + 40, 288 * 4 + 50);
  for (const [name, paint] of Object.entries(designs)) {
    for (const [stateName, state] of Object.entries(states)) {
      const id = `${name}-${stateName}`;
      if (only.length && !only.some((f) => id.includes(f))) continue;
      const band = paint(state).withDrawsBaked();
      const output = blank(640, 480);
      output.bitBlt(band, rect.x, rect.y);
      const rgba = new Uint8Array(640 * 480 * 4);
      for (let i = 0; i < output.pixels.length; i++) {
        const v = graphics.grayToNibble(output.pixels[i]) * 17;
        rgba.set([v, v, v, 255], i * 4);
      }
      const out = path.join(__dirname, 'out', `clock-fable-${id}.png`);
      fs.writeFileSync(out, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
      written.push(out);
      const col = Object.keys(designs).indexOf(name), row = Object.keys(states).indexOf(stateName);
      sheet.bitBlt(band, 10 + col * 586, 10 + row * 298);
    }
  }
  if (!only.length) {
    const rgba = new Uint8Array(sheet.width * sheet.height * 4);
    for (let i = 0; i < sheet.pixels.length; i++) {
      const v = graphics.grayToNibble(sheet.pixels[i]) * 17;
      rgba.set([v, v, v, 255], i * 4);
    }
    const out = path.join(__dirname, 'out', 'clock-fable-sheet.png');
    fs.writeFileSync(out, Buffer.from(UPNG.encode([rgba.buffer], sheet.width, sheet.height, 0)));
    written.push(out);
  }
  console.log(written.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
