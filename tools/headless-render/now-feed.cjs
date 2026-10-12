// "What is happening": the clock stays; a turn of the ring shows the things
// themselves, one per turn, full band, no app names. Tap acts on the item.
//   node now-feed.cjs → out/now-*.png and out/now-*-lens.png
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
  png(out, path.join(outDir, `now-${name}.png`));
  png(baked, path.join(outDir, `now-${name}-lens.png`), true);
  console.log(`now-${name}`);
}
const ttfFace = (size) => { const f = TtfFont.load(adapter.fontPath, size); return { lineHeight: f.lineHeight, measureLine: (t) => f.measureText(t), drawText: (...a) => f.drawText(...a) }; };

async function main() {
  const face = await stockFont(graphics);
  const big = ttfFace(28);
  await adapter.prepareIcons(['calendar', 'circle', 'glasses', 'battery', 'cloud-sun', 'square-terminal'].map((n) => ICON_SVGS[n]));
  const data = scenes(new Date(2026, 9, 10, 9, 41), calendarCardState);
  const text = (image, f, x, y, label, value = WHITE, width = image.width - x) => {
    assert.ok(f.measureLine(label) <= width, `overflow: ${label}`);
    f.drawText(image, x, y, label, value);
  };
  const right = (image, f, xRight, y, label, value = WHITE) => text(image, f, xRight - f.measureLine(label), y, label, value);
  const wrap = (f, label, width) => {
    const lines = []; let line = '';
    for (const word of label.split(' ')) { const next = line ? `${line} ${word}` : word; if (f.measureLine(next) <= width) line = next; else { lines.push(line); line = word; } }
    if (line) lines.push(line); return lines;
  };

  // Home: the column as it is. Nothing on the right.
  { const image = new graphics.GrayImage(576, 288); image.bitBlt(paintHomeColumn(homeColumnState(data.now, data.battery, data.weather, data.paseo), face), 0, 0); save(image, 'home'); }

  // The things happening right now, by urgency then time. No app names anywhere.
  const THINGS = [
    { kind: 'question', when: 'now', context: 'Fix reconnect after BLE drop', main: '¿Apruebas correr los tests de BLE?', choices: ['Yes', 'No', 'Reply'] },
    { kind: 'event', when: 'in 49 min', context: '10:30 – 11:00 · Sala Norte', main: 'Daily con el equipo' },
    { kind: 'ready', when: '4 min ago', context: 'PR #1221 · jelou-cli', main: 'Listo para fusionar a producción.' },
    { kind: 'event', when: 'Tomorrow 09:00', context: '09:00 – 10:00', main: 'Dentista' },
  ];

  // One thing fills the band: the clock shrinks to a line at the top; what it is sits big in the lower half.
  const thing = (index, { choice = -1, peek = true } = {}) => {
    const image = new graphics.GrayImage(576, 288);
    const t = THINGS[index];
    text(image, face, 24, 8, '09:41', DIM);
    text(image, face, 24 + face.measureLine('09:41') + 14, 8, 'Sat 10', FAINT);
    right(image, face, 552, 8, `${index + 1} of ${THINGS.length}`, FAINT);
    // The previous thing's main line peeks above, faint, so the ring feels like a continuous strip.
    if (peek && index > 0) text(image, face, 24, 44, THINGS[index - 1].main, FAINT, 528);
    const top = 96;
    text(image, face, 24, top, t.when, t.when === 'now' ? WHITE : DIM);
    const lines = wrap(big, t.main, 528);
    lines.forEach((l, i) => text(image, big, 24, top + 30 + i * 36, l, WHITE, 528));
    const after = top + 30 + lines.length * 36 + 6;
    text(image, face, 24, after, t.context, DIM, 528);
    if (t.choices) {
      let x = 24; const y = 244;
      t.choices.forEach((c, i) => {
        const on = i === choice;
        if (on) { text(image, face, x, y, '>', WHITE); x += face.measureLine('> '); }
        text(image, face, x, y, c, on ? WHITE : choice >= 0 ? FAINT : DIM);
        x += face.measureLine(c) + 34;
      });
    } else if (peek && index + 1 < THINGS.length) text(image, face, 24, 248, THINGS[index + 1].main, FAINT, 528);
    return image;
  };
  save(thing(0), '1-question');
  save(thing(0, { choice: 0 }), '1-question-choosing');
  save(thing(1), '2-event');
  save(thing(2), '3-ready');
  save(thing(3), '4-tomorrow');

  // After the last thing: nothing else, and the two things you can start.
  {
    const image = new graphics.GrayImage(576, 288);
    text(image, face, 24, 8, '09:41', DIM);
    text(image, face, 24 + face.measureLine('09:41') + 14, 8, 'Sat 10', FAINT);
    text(image, face, 24, 44, THINGS[3].main, FAINT, 528);
    text(image, big, 24, 110, 'Nothing else for now.', DIM, 528);
    text(image, face, 24, 200, '>', WHITE);
    text(image, face, 46, 200, 'Translate', WHITE);
    text(image, face, 46 + face.measureLine('Translate') + 30, 200, 'ES / EN', DIM);
    text(image, face, 46, 227, 'Converse', DIM);
    text(image, face, 46 + face.measureLine('Converse') + 30, 227, 'Live facts', FAINT);
    save(image, '5-end');
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
