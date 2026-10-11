// Six visual treatments of the same "thing" (a question, an event).
//   node now-styles.cjs → out/ns-<style>-<thing>.png and -lens.png
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const context = createRenderContext();
const { graphics, adapter, TtfFont } = context;
const outDir = path.join(__dirname, 'out');
const WHITE = 255, DIM = 153, FAINT = 85, INK = 51;

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
  png(out, path.join(outDir, `ns-${name}.png`));
  png(baked, path.join(outDir, `ns-${name}-lens.png`), true);
  console.log(`ns-${name}`);
}
const ttfFace = (size) => { const f = TtfFont.load(adapter.fontPath, size); return { lineHeight: f.lineHeight, measureLine: (t) => f.measureText(t), drawText: (...a) => f.drawText(...a) }; };

// Dot digits borrowed in shape from the column clock, at a smaller pitch.
const DIGITS = { '4': ["00010","00110","01010","10010","11111","00010","00010"], '9': ["01110","10001","10001","01111","00001","00001","01110"], '1': ["00100","01100","00100","00100","00100","00100","01110"], '0': ["01110","10001","10001","10001","10001","10001","01110"], '3': ["11110","00001","00001","01110","00001","00001","11110"] };
function dots(image, x, y, str, dot = 5, pitch = 7, value = WHITE) {
  Array.from(str).forEach((ch, i) => (DIGITS[ch] || []).forEach((row, dy) => Array.from(row).forEach((on, dx) => { if (on === '1') image.fillRoundedRect(x + i * (pitch * 5 + 8) + dx * pitch, y + dy * pitch, dot, dot, value, 2); })));
}

async function main() {
  const face = await stockFont(graphics);
  const big = ttfFace(28), huge = ttfFace(44);
  const text = (image, f, x, y, label, value = WHITE, width = image.width - x) => { assert.ok(f.measureLine(label) <= width, `overflow: ${label}`); f.drawText(image, x, y, label, value); };
  const right = (image, f, xr, y, label, value = WHITE) => text(image, f, xr - f.measureLine(label), y, label, value);
  const center = (image, f, y, label, value = WHITE) => text(image, f, Math.round((576 - f.measureLine(label)) / 2), y, label, value);
  const wrap = (f, label, width) => { const lines = []; let line = ''; for (const w of label.split(' ')) { const n = line ? `${line} ${w}` : w; if (f.measureLine(n) <= width) line = n; else { lines.push(line); line = w; } } if (line) lines.push(line); return lines; };

  const THINGS = {
    question: { when: 'now', num: null, main: '¿Apruebas correr los tests de BLE?', from: 'Fix reconnect after BLE drop', choices: ['Yes', 'No', 'Reply'], prev: null, next: 'Daily con el equipo', pos: '1 of 4' },
    event: { when: 'in 49 min', num: '49', unit: 'min', main: 'Daily con el equipo', from: '10:30 – 11:00 · Sala Norte', choices: null, prev: '¿Apruebas correr los tests de BLE?', next: 'Listo para fusionar a producción.', pos: '2 of 4' },
  };
  const clockLine = (image, t, value = DIM) => { text(image, face, 24, 8, '09:41', value); text(image, face, 24 + face.measureLine('09:41') + 14, 8, 'Sat 10', FAINT); right(image, face, 552, 8, t.pos, FAINT); };
  const choicesRow = (image, t, x, y, selected = 0, gap = 34) => { if (!t.choices) return; let cx = x; t.choices.forEach((c, i) => { const on = i === selected; if (on) { text(image, face, cx, y, '>', WHITE); cx += face.measureLine('> '); } text(image, face, cx, y, c, on ? WHITE : FAINT); cx += face.measureLine(c) + gap; }); };

  // A · Editorial: left aligned text, nothing else (the current now-feed).
  const styleA = (t) => { const image = new graphics.GrayImage(576, 288); clockLine(image, t); if (t.prev) text(image, face, 24, 44, t.prev, FAINT, 528);
    text(image, face, 24, 96, t.when, t.when === 'now' ? WHITE : DIM); const lines = wrap(big, t.main, 528); lines.forEach((l, i) => text(image, big, 24, 126 + i * 36, l)); text(image, face, 24, 132 + lines.length * 36, t.from, DIM, 528);
    if (t.choices) choicesRow(image, t, 24, 244); else if (t.next) text(image, face, 24, 248, t.next, FAINT, 528); return image; };

  // B · Centrado: a title card, everything centred, the clock line stays.
  const styleB = (t) => { const image = new graphics.GrayImage(576, 288); clockLine(image, t);
    center(image, face, 84, t.when, t.when === 'now' ? WHITE : DIM); const lines = wrap(big, t.main, 500); lines.forEach((l, i) => center(image, big, 116 + i * 36, l)); center(image, face, 122 + lines.length * 36, t.from, DIM);
    if (t.choices) { const total = t.choices.reduce((s, c) => s + face.measureLine(c), 0) + 40 * (t.choices.length - 1) + face.measureLine('> '); choicesRow(image, t, Math.round((576 - total) / 2), 236, 0, 40); }
    else { image.fillRect(272, 242, 32, 1, FAINT); if (t.next) center(image, face, 250, t.next, FAINT); } return image; };

  // C · Gravedad: everything in the lower half, closest to the natural gaze; upper half dark.
  const styleC = (t) => { const image = new graphics.GrayImage(576, 288); text(image, face, 24, 8, '09:41', FAINT); right(image, face, 552, 8, t.pos, FAINT);
    const lines = wrap(big, t.main, 528); let y = 288 - 24 - 27 - (t.choices ? 40 : 0) - 27 - lines.length * 36 - 8;
    text(image, face, 24, y, t.when, t.when === 'now' ? WHITE : DIM); y += 30; lines.forEach((l, i) => text(image, big, 24, y + i * 36, l)); y += lines.length * 36 + 6; text(image, face, 24, y, t.from, DIM, 528); y += 27 + 10;
    if (t.choices) choicesRow(image, t, 24, y); image.fillRect(24, 272, 528, 1, FAINT); return image; };

  // D · Cuándo grande: the "when" is a big dot number on the left, the thing on the right.
  const styleD = (t) => { const image = new graphics.GrayImage(576, 288); clockLine(image, t);
    if (t.num) { dots(image, 24, 84, t.num, 6, 8); text(image, face, 24, 160, t.unit, DIM); } else { text(image, huge, 24, 80, 'now', WHITE); }
    const x = 200; const lines = wrap(big, t.main, 352); lines.forEach((l, i) => text(image, big, x, 84 + i * 36, l, WHITE, 352)); text(image, face, x, 90 + lines.length * 36, t.from, DIM, 352);
    if (t.choices) choicesRow(image, t, x, 244); else if (t.next) text(image, face, x, 248, t.next, FAINT, 352); return image; };

  // E · Marco terminal: the spec's frame, footer "· now  1/4", a nested box for the choices.
  const styleE = (t) => { const image = new graphics.GrayImage(576, 288); image.drawRoundedRect(4, 4, 568, 280, WHITE, 8); image.fillRect(14, 244, 548, 1, 119);
    text(image, face, 22, 252, `· ${t.when}`, 119); right(image, face, 554, 252, `09:41  ${t.pos}`, 119);
    const lines = wrap(big, t.main, 510); lines.forEach((l, i) => text(image, big, 22, 22 + i * 36, l)); text(image, face, 22, 28 + lines.length * 36, t.from, DIM, 510);
    if (t.choices) { let y = 140; t.choices.forEach((c, i) => { const on = i === 0; if (on) text(image, face, 34, y, '>', WHITE); text(image, face, 56, y, c, on ? WHITE : DIM); y += 27; }); image.drawRoundedRect(22, 130, 160, 92, DIM, 6); }
    else if (t.next) { text(image, face, 22, 200, 'Next', FAINT); text(image, face, 22 + face.measureLine('Next') + 12, 200, t.next, FAINT, 440); } return image; };

  // F · Riel: a 3 px bar at the left of the thing (the watchOS widget bar), prev/next as short faint bars.
  const styleF = (t) => { const image = new graphics.GrayImage(576, 288); clockLine(image, t);
    const top = 86, lines = wrap(big, t.main, 500); const h = 30 + lines.length * 36 + 27 + (t.choices ? 40 : 0);
    image.fillRect(24, top, 3, h, WHITE); if (t.prev) image.fillRect(24, top - 30, 3, 18, FAINT); if (t.next) image.fillRect(24, top + h + 12, 3, 18, FAINT);
    text(image, face, 44, top, t.when, t.when === 'now' ? WHITE : DIM); lines.forEach((l, i) => text(image, big, 44, top + 30 + i * 36, l)); text(image, face, 44, top + 36 + lines.length * 36, t.from, DIM, 500);
    if (t.choices) { let cx = 44; const y = top + 36 + lines.length * 36 + 36; t.choices.forEach((c, i) => { const w = face.measureLine(c) + 20; if (i === 0) { image.fillRoundedRect(cx, y - 4, w, 28, WHITE, 4); text(image, face, cx + 10, y, c, 0); } else { image.drawRoundedRect(cx, y - 4, w, 28, FAINT, 4); text(image, face, cx + 10, y, c, DIM); } cx += w + 14; }); }
    return image; };

  for (const [name, fn] of [['a-editorial', styleA], ['b-centrado', styleB], ['c-gravedad', styleC], ['d-cuando', styleD], ['e-marco', styleE], ['f-riel', styleF]]) for (const k of ['question', 'event']) save(fn(THINGS[k]), `${name}-${k}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
