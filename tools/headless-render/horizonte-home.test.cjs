const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const UPNG = require('upng-js');
const context = createRenderContext();
const { graphics, TtfFont, adapter, load } = context;
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const { paintHorizonte } = load('app/apps/home/horizonte-painter.ts');
const font = TtfFont.load(adapter.fontPath, 80);
const clockFace = { lineHeight: font.lineHeight, measureLine: text => font.measureText(text),
  drawText: (...args) => font.drawText(...args) };
const facePromise = stockFont(graphics);

test('Horizonte uses the bundled Roboto Light at 80px for both selected clocks', async () => {
  const face = await facePromise;
  for (const time of ['09:41', '22:27', '00:00', '23:59']) {
    assert.ok(font.measureText(time) <= 198, `${time}: ${font.measureText(time)}`);
    const column = paintHorizonte({ time, date: 'Miércoles 7 oct', eventLine: null, nextLine: null, title: null }, face, clockFace);
    const expected = new graphics.GrayImage(212, 288);
    font.drawText(expected, 14, 23, time, 255);
    const baked = expected.withDrawsBaked();
    assert.deepEqual(column.pixels.slice(0, 118 * 212), baked.pixels.slice(0, 118 * 212));
    assert.equal(column.getPixel(18, 161), 85);
    assert.equal(column.getPixel(211, 161), 85);
  }
});

test('six Horizonte clock/event combinations fit the unchanged app card and dots', async () => {
  const face = await facePromise;
  for (const [hour, minute] of [[9, 41], [22, 27]]) {
    const now = new Date(2026, 9, 7, hour, minute);
    for (const state of ['proximo', 'ahora', 'manana']) {
      const start = state === 'manana' ? new Date(2026, 9, 8, 10, 30).getTime()
        : now.getTime() + (state === 'proximo' ? 25 : -15) * 60_000;
      const events = [{ title: 'Daily con el equipo de producto', startMs: start, endMs: start + 3600_000, allDay: false }];
      const data = { now, calendar: calendarCardState(true, events, now.getTime()), music: null, notifications: [] };
      const image = paintHome(1, data, face, clockFace);
      for (let y = 0; y < 288; y++) for (let x = 212; x < 218; x++) assert.equal(image.getPixel(x, y), 0);
      for (let i = 0; i < 5; i++) assert.equal(image.getPixel(218, 120 + i * 11), i === 1 ? 255 : 85);
      assert.equal(image.getPixel(250, 14), 255);
      if (process.env.HORIZONTE_REVIEW_DIR) {
        fs.mkdirSync(process.env.HORIZONTE_REVIEW_DIR, { recursive: true });
        const rgba = new Uint8Array(576 * 288 * 4);
        image.pixels.forEach((value, i) => {
          const v = graphics.grayToNibble(value) * 17;
          rgba.set([Math.round(v * 0.30), v, Math.round(v * 0.12), 255], i * 4);
        });
        fs.writeFileSync(path.join(process.env.HORIZONTE_REVIEW_DIR, `${hour}${minute}-${state}.png`),
          Buffer.from(UPNG.encode([rgba.buffer], 576, 288, 0)));
      }
    }
  }
});
