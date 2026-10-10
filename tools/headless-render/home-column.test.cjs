/**
 * The lean home's left column through the production painter and the stock
 * font: dot-matrix clock, day, ring/glasses gauges, weather and Paseo
 * needs-you, beside the Paseo, Calendar and Translate cards at 09:41 and
 * 22:07. Writes out/home-column-*.png and checks that nothing overlaps or
 * clips, the chrome is English without gesture hints, hidden complications
 * leave no ink, and the card and dots are untouched.
 *
 *   node --test tools/headless-render/home-column.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRenderContext } = require('./render.cjs');
const { renderHomeColumn, save } = require('./home-column.cjs');

const context = createRenderContext();
const { graphics, load } = context;
const { CLOCK_LEFT, CLOCK_TOP, CLOCK_BOTTOM, COLUMN_WIDTH } = load('app/apps/home/column-painter.ts');
const SPANISH = /Sábado|Sab |Toca|Sin |Más|Traducir|Calendario|Ahora|Mañana/;
const HINTS = /Tap |Hold |tap to|hold to|scroll to/i;

function inkRows(image, x0, x1, y0, y1) {
  const rows = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (image.getPixel(x, y)) { rows.push(y); break; }
  return rows;
}
function inkColumns(image, x0, x1, y0, y1) {
  const columns = [];
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) if (image.getPixel(x, y)) { columns.push(x); break; }
  return columns;
}
function runs(values) {
  const out = [];
  for (const value of values) {
    const last = out.at(-1);
    if (last && value === last[1] + 1) last[1] = value; else out.push([value, value]);
  }
  return out;
}
function tracing(face) {
  const draws = [];
  return { draws, face: {
    lineHeight: face.lineHeight,
    measureLine: text => face.measureLine(text),
    drawText: (image, x, y, text, value = 255) => {
      assert.ok(x >= 0 && x + face.measureLine(text) <= image.width, `${text} overflows at x=${x}`);
      assert.ok(y >= 0 && y + face.lineHeight <= image.height, `${text} outside at y=${y}`);
      assert.ok(!SPANISH.test(text), `Spanish chrome: ${text}`);
      assert.ok(!HINTS.test(text), `gesture hint: ${text}`);
      draws.push({ text, x, y, value, width: image.width });
      face.drawText(image, x, y, text, value);
    },
  } };
}

test('six scenes: rows and clock never touch, both complication rows keep a gap, the card side is untouched', async () => {
  let count = 0;
  for await (const { name, image, data, face } of renderHomeColumn(context)) {
    count++;
    const baked = image.withDrawsBaked();
    const file = save(graphics, baked, name);
    const hh = String(data.now.getHours()).padStart(2, '0');
    // Column pieces stay in their bands: top row, clock, bottom row, with empty gaps between.
    const rows = inkRows(baked, 0, COLUMN_WIDTH, 0, 288);
    assert.ok(rows.length, name);
    assert.ok(Math.min(...rows) >= 12, `${name}: top margin`);
    assert.ok(Math.max(...rows) < 276, `${name}: bottom margin`);
    for (const y of rows) {
      assert.ok(y < 40 || (y >= CLOCK_TOP && y < CLOCK_BOTTOM) || y >= 248, `${name}: ink between rows at y=${y}`);
    }
    // Top row: the day text ends before the ring gauge; bottom row: weather ends well before the needs count.
    const top = runs(inkColumns(baked, 0, COLUMN_WIDTH, 12, 40));
    assert.ok(top.some(([, end], i) => top[i + 1] && top[i + 1][0] - end >= 20 && end < 114), `${name}: day/gauge gap ${JSON.stringify(top)}`);
    const bottom = runs(inkColumns(baked, 0, COLUMN_WIDTH, 248, 276));
    assert.ok(bottom.some(([, end], i) => bottom[i + 1] && bottom[i + 1][0] - end >= 40), `${name}: weather/needs gap ${JSON.stringify(bottom)}`);
    // Clock: the hour's first digit at the expected origin (0 has a left stroke at row 3, 2 has not), no ink in the left margin.
    assert.equal(baked.getPixel(CLOCK_LEFT + 3, CLOCK_TOP + 33), hh[0] === '0' ? 255 : 0, `${name}: digit ${hh[0]} left stroke`);
    assert.equal(baked.getPixel(CLOCK_LEFT + 23, CLOCK_TOP + 33), 0, `${name}: digit ${hh[0]} open centre`);
    assert.equal(inkColumns(baked, 0, 40, CLOCK_TOP, CLOCK_BOTTOM).length, 0, `${name}: clock left margin`);
    // Dots and card exactly where the app keeps them; nothing right of the card or between column and dots.
    for (let y = 0; y < 288; y++) for (let x = COLUMN_WIDTH; x < 218; x++) assert.equal(baked.getPixel(x, y), 0, `${name}: gutter ${x},${y}`);
    for (let y = 0; y < 288; y++) for (let x = 548; x < 576; x++) assert.equal(baked.getPixel(x, y), 0);
    assert.equal(baked.getPixel(250, 14), 255, `${name}: card border`);
    assert.equal(baked.getPixel(230, 100), 255, `${name}: card left border`);
    assert.ok(file.endsWith(`${name}.png`));
    assert.equal(face.lineHeight, 27, 'stock face');
  }
  assert.equal(count, 6);
});

test('the column texts are English, white and crisp, and hidden complications leave no ink', async () => {
  const { paintHome } = load('app/apps/home/home-painter.ts');
  const { calendarCardState } = load('app/apps/home/home-model.ts');
  const { stockFont } = require('./stock-font.cjs');
  const stock = await stockFont(graphics);
  const now = new Date(2026, 9, 10, 9, 41);
  const base = { now, calendar: calendarCardState(true, [], now.getTime()), translateReady: true };
  const full = { ...base, paseo: { configured: true, status: '', updates: [], needs: 12, working: 0 },
    battery: { ring: 72, glasses: 88 }, weather: { temperatureC: 27.4, code: 2, isDay: true, atMs: now.getTime() } };
  {
    const { draws, face } = tracing(stock);
    const image = paintHome(2, full, face);
    const column = draws.filter(draw => draw.width === COLUMN_WIDTH);
    assert.deepEqual(column.map(draw => draw.text), ['Sat 10', '27°', '12']);
    assert.ok(column.every(draw => draw.value === 255));
    const levels = new Set(Array.from(image.pixels.slice(0, 288 * 576)).filter((_, i) => i % 576 < COLUMN_WIDTH).map(v => graphics.grayToNibble(v)));
    assert.ok(levels.has(15), 'white ink');
    const gauge = (x) => Math.max(...inkColumns(image, x, x + 20, 12, 40).map(() => 1), 0);
    assert.equal(gauge(COLUMN_WIDTH - 75), 1, 'ring gauge drawn');
    assert.equal(gauge(COLUMN_WIDTH - 21), 1, 'glasses gauge drawn');
    save(graphics, image, 'home-column-full');
  }
  {
    const { draws, face } = tracing(stock);
    const image = paintHome(0, { ...base, paseo: null }, face);
    assert.deepEqual(draws.filter(draw => draw.width === COLUMN_WIDTH).map(draw => draw.text), ['Sat 10']);
    assert.equal(inkRows(image, 0, COLUMN_WIDTH, 240, 288).length, 0, 'no bottom row without weather or needs');
    // Unknown batteries: the gauges are there but dim and empty.
    let brightest = 0;
    for (let y = 12; y < 40; y++) for (let x = COLUMN_WIDTH - 98; x < COLUMN_WIDTH; x++) brightest = Math.max(brightest, image.getPixel(x, y));
    assert.ok(brightest > 0 && brightest < 160, `dim gauges: ${brightest}`);
    for (let y = 23; y < 30; y++) assert.equal(image.getPixel(COLUMN_WIDTH - 44 + 23 + 6, y), 0, 'empty glasses gauge body');
    save(graphics, image, 'home-column-unknown');
  }
  {
    const { draws, face } = tracing(stock);
    paintHome(0, { ...full, paseo: { ...full.paseo, configured: false } }, face);
    assert.deepEqual(draws.filter(draw => draw.width === COLUMN_WIDTH).map(draw => draw.text), ['Sat 10', '27°']);
  }
  {
    const { draws, face } = tracing(stock);
    const image = paintHome(0, { ...full, battery: { ring: 3, glasses: 100 }, weather: { temperatureC: -4.6, code: 73, isDay: false, atMs: now.getTime() } }, face);
    assert.deepEqual(draws.filter(draw => draw.width === COLUMN_WIDTH).map(draw => draw.text), ['Sat 10', '-5°', '12']);
    for (let x = COLUMN_WIDTH - 44 + 23 + 4; x < COLUMN_WIDTH - 44 + 23 + 13; x++) assert.equal(image.getPixel(x, 24), 255, 'full glasses gauge');
    assert.equal(image.getPixel(COLUMN_WIDTH - 98 + 23 + 5, 24), 0, 'nearly empty ring gauge');
    save(graphics, image, 'home-column-extremes');
  }
});
