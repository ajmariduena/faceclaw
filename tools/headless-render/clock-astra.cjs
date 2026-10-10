const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRenderContext } = require('./render.cjs');
const { createV3Scenes } = require('./v3-scenes.cjs');
const { stockFont } = require('./stock-font.cjs');
const UPNG = require('upng-js');

const OUTPUT = path.join(__dirname, 'out');
const TIMES = ['09:41', '22:27'];
const DATE = 'Miércoles 7 oct';
const TITLE = 'Daily con el equipo de producto';
const STATES = [
  { id: 'a-proximo', status: 'en 25 min', time: '10:30', title: TITLE },
  { id: 'b-ahora', status: 'Ahora', time: '10:30', title: TITLE },
  { id: 'c-manana', status: 'Mañana', time: '10:30', title: TITLE, empty: true },
];
const DIGITS = {
  0: [[[10, 3], [31, 3], [39, 11], [39, 56], [31, 64], [10, 64], [3, 56], [3, 11], [10, 3]]],
  1: [[[9, 14], [22, 3], [22, 64]], [[10, 64], [35, 64]]],
  2: [[[3, 14], [3, 11], [11, 3], [31, 3], [39, 11], [39, 23], [4, 57], [4, 64], [39, 64]]],
  3: [[[4, 3], [30, 3], [39, 11], [39, 24], [30, 32], [16, 32]], [[30, 32], [39, 40], [39, 56], [31, 64], [4, 64]]],
  4: [[[28, 3], [3, 43], [40, 43]], [[29, 19], [29, 64]]],
  5: [[[39, 3], [4, 3], [4, 30], [30, 30], [39, 39], [39, 56], [31, 64], [4, 64]]],
  6: [[[37, 3], [12, 3], [3, 13], [3, 55], [12, 64], [31, 64], [39, 56], [39, 39], [31, 31], [3, 31]]],
  7: [[[3, 3], [39, 3], [39, 9], [14, 64]]],
  8: [[[11, 3], [31, 3], [39, 11], [39, 24], [31, 32], [11, 32], [3, 24], [3, 11], [11, 3]], [[11, 32], [3, 40], [3, 56], [11, 64], [31, 64], [39, 56], [39, 40], [31, 32]]],
  9: [[[39, 33], [11, 33], [3, 25], [3, 11], [11, 3], [31, 3], [39, 11], [39, 54], [29, 64], [5, 64]]],
};

async function main() {
  const context = createRenderContext();
  const { graphics, TtfFont, adapter } = context;
  const face = await stockFont(graphics);
  const scenes = await createV3Scenes(context);
  const original = scenes.home('music').withDrawsBaked();
  const card = new graphics.GrayImage(318, 260);
  card.bitBlt(original, 0, 0, { sx: 230, sy: 14, width: 318, height: 260 });
  const fonts = new Map();
  const font = size => {
    if (!fonts.has(size)) fonts.set(size, TtfFont.load(adapter.fontPath, size));
    assert.ok(fonts.get(size));
    return fonts.get(size);
  };
  const measure = (f, text) => f.measureLine ? f.measureLine(text) : f.measureText(text);
  const truncated = (f, text, width) => {
    if (measure(f, text) <= width) return text;
    const chars = [...text];
    while (chars.length && measure(f, chars.join('') + '…') > width) chars.pop();
    return chars.join('').trimEnd() + '…';
  };
  const records = [];
  let textRecords;
  function text(image, f, x, y, label, value = 255, width = 232 - x) {
    for (const char of label) assert.ok(char === ' ' || f.hasGlyph(char.codePointAt(0)), `Missing glyph: ${char}`);
    assert.ok(measure(f, label) <= width, `Overflow: ${label} ${measure(f, label)} > ${width}`);
    assert.ok(y >= 0 && y + f.lineHeight <= 288, `Outside band: ${label}`);
    f.drawText(image, x, y, label, value);
    textRecords.push({ label, x, y, width: measure(f, label), value });
  }
  function title(image, x, y, width = 232 - x, lines = 2) {
    const words = TITLE.split(' ');
    for (let line = 0; line < lines && words.length; line++) {
      if (line === lines - 1) {
        text(image, face, x, y + line * 27, truncated(face, words.join(' '), width), 255, width);
      } else {
        let label = words.shift();
        while (words.length && measure(face, label + ' ' + words[0]) <= width) label += ' ' + words.shift();
        text(image, face, x, y + line * 27, label, 255, width);
      }
    }
  }
  const bitmapDigits = new Map();
  function digit(number) {
    if (bitmapDigits.has(number)) return bitmapDigits.get(number);
    const image = new graphics.GrayImage(44, 68);
    for (const points of DIGITS[number]) {
      for (let i = 1; i < points.length; i++) {
        const [ax, ay] = points[i - 1], [bx, by] = points[i];
        for (let y = Math.max(0, Math.min(ay, by) - 3); y <= Math.min(67, Math.max(ay, by) + 3); y++) {
          for (let x = Math.max(0, Math.min(ax, bx) - 3); x <= Math.min(43, Math.max(ax, bx) + 3); x++) {
            const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
            if (Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)) <= 2.5) image.setPixel(x, y, 255);
          }
        }
      }
    }
    bitmapDigits.set(number, image);
    return image;
  }
  function bitmapClock(image, time, x, y) {
    const values = time.replace(':', '');
    [0, 49, 117, 166].forEach((offset, i) => image.drawImage(digit(values[i]).dimmed(i < 2 ? 1 : 221 / 255), x + offset, y));
    image.fillRect(x + 104, y + 21, 4, 4, 204);
    image.fillRect(x + 104, y + 45, 4, 4, 204);
  }
  const designs = [
    {
      id: 'horizonte',
      cost: '4–6 h',
      paint(image, time, state) {
        text(image, font(80), 14, 23, time);
        text(image, face, 18, 118, DATE, 204);
        image.fillRect(18, 161, 212, 1, 85);
        text(image, face, 18, 181, state.empty ? 'Sin eventos hoy' : `${state.time} · ${state.status}`, 221);
        if (state.empty) {
          text(image, face, 18, 211, `Mañana ${state.time}`, 255);
          title(image, 18, 241, 214, 1);
        } else title(image, 18, 214, 214, 1);
      },
    },
    {
      id: 'agenda',
      cost: '6–8 h',
      paint(image, time, state) {
        text(image, font(48), 17, 17, time);
        text(image, face, 18, 81, DATE, 204);
        text(image, font(38), 16, 126, state.status, 255);
        text(image, face, 18, 181, state.empty ? `Sin eventos hoy` : state.time, 204);
        if (state.empty) {
          text(image, face, 18, 211, state.time, 221);
          title(image, 18, 241, 214, 1);
        } else title(image, 18, 214, 214, 1);
      },
    },
    {
      id: 'senal',
      cost: '1–2 días',
      paint(image, time, state) {
        text(image, face, 18, 19, DATE, 204);
        bitmapClock(image, time, 18, 69);
        image.fillRect(18, 182, 3, 83, state.id === 'b-ahora' ? 255 : 153);
        text(image, face, 32, 175, state.empty ? 'Sin eventos hoy' : state.status, 221, 198);
        text(image, face, 32, 205, state.empty ? `Mañana ${state.time}` : state.time, 255, 198);
        title(image, 32, 238, 198, 1);
      },
    },
  ];
  fs.mkdirSync(OUTPUT, { recursive: true });
  for (const design of designs) {
    for (const time of TIMES) {
      for (const state of STATES) {
        textRecords = [];
        const band = new graphics.GrayImage(576, 288);
        design.paint(band, time, state);
        const left = band.withDrawsBaked();
        for (let y = 0; y < 288; y++) for (let x = 234; x < 576; x++) assert.equal(left.pixels[y * 576 + x], 0, 'Left column overlaps the card gutter');
        band.bitBlt(card, 250, 14);
        const output = new graphics.GrayImage(640, 480);
        output.bitBlt(band.withDrawsBaked(), 32, 96);
        for (let y = 0; y < 260; y++) {
          assert.deepEqual(output.pixels.slice((110 + y) * 640 + 282, (110 + y) * 640 + 600), card.pixels.slice(y * 318, (y + 1) * 318));
        }
        const rgba = new Uint8Array(640 * 480 * 4);
        const palette = new Set();
        for (let i = 0; i < output.pixels.length; i++) {
          const v = graphics.grayToNibble(output.pixels[i]) * 17;
          const pixel = [Math.round(v * 0.30), v, Math.round(v * 0.12), 255];
          rgba.set(pixel, i * 4);
          palette.add(pixel.join(','));
          if (v) assert.ok(i % 640 >= 32 && i % 640 < 608 && Math.floor(i / 640) >= 96 && Math.floor(i / 640) < 384);
        }
        assert.ok(palette.size <= 16);
        const file = path.join(OUTPUT, `clock-astra-${design.id}-${time.replace(':', '')}-${state.id}.png`);
        fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
        const decoded = UPNG.decode(fs.readFileSync(file));
        assert.equal(decoded.width, 640);
        assert.equal(decoded.height, 480);
        assert.deepEqual(new Uint8Array(UPNG.toRGBA8(decoded)[0]), rgba);
        records.push({ file, cost: design.cost, palette: palette.size, text: textRecords });
      }
    }
  }
  const glyphBytes = (size, chars) => [...new Set(chars)].reduce((sum, ch) => {
    const g = font(size).getGlyph(ch.codePointAt(0));
    return sum + Math.ceil(g.bbxWidth * g.bbxHeight / 2);
  }, 0);
  console.log(JSON.stringify({
    outputs: records,
    band: { x: 32, y: 96, width: 576, height: 288 },
    card: { source: 'v3-scenes.cjs / music', x: 250, y: 14, width: 318, height: 260, identical: true },
    fixture: 'Estados y relojes independientes por petición: 10:30 / en 25 min es texto fijo, no una resta de 09:41 ni 22:27.',
    packed4bppClockBytes: { horizonte: glyphBytes(80, '0123456789:'), agenda: glyphBytes(48, '0123456789:'), senal: 10 * 44 * 68 / 2 },
    agendaStatusGlyphBytes: glyphBytes(38, 'en 0123456789minAhoraMañana'),
    integration: { timerCurrentlyMs: 30000, target: 'Invalidar al cambiar el minuto, el calendario o el estado del evento; reutilizar glifos y tarjeta.', risks: 'Presupuesto adicional de atlas, rasterización Android frente a Skia, símbolos stock desconocidos y cambio de día. Medidas de payload sin cabeceras, padding ni cachés nativas.' },
  }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
