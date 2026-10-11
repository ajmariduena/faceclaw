const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/load-typescript.cjs');
const load = loader({ Uint32Array, Int32Array, DataView, ArrayBuffer }, {
  '@nativescript/core': { knownFolders: {} },
});
const { BdfFont } = load('app/graphics/bdffont.ts');
const { paintHome, HOME_DOTS_TOP } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const font = BdfFont.parse(fs.readFileSync('app/fonts/terminus/ter-u20n.bdf', 'utf8'));
let textDraws = [];
const face = {
  lineHeight: font.lineHeight,
  measureLine: text => font.measureText(text),
  drawText(image, x, y, text, value) {
    assert.ok(x >= 0 && x + font.measureText(text) <= image.width, text);
    assert.ok(y >= 0 && y + font.lineHeight <= image.height, text);
    textDraws.push({ text, value, x, y, width: image.width });
    font.drawText(image, x, y, text, value);
  },
};
const texts = () => textDraws.map(draw => draw.text);
const NOW = new Date(2026, 9, 10, 9, 41);
const snapshot = extra => ({ now: NOW, calendar: calendarCardState(true, [], NOW.getTime()), paseo: null, ...extra });

test('app paints one bordered card with six stable dots centred on the card and the clock column, in English', () => {
  textDraws = [];
  const data = snapshot();
  for (let card = 0; card < 6; card++) {
    const image = paintHome(card, data, face);
    assert.equal(image.width, 576);
    assert.equal(image.height, 288);
    assert.equal(image.pixels[14 * 576 + 250], 255);
    assert.equal(HOME_DOTS_TOP, 115);
    for (let i = 0; i < 6; i++) assert.equal(image.pixels[(115 + i * 11) * 576 + 218], i === card ? 255 : 85);
    assert.equal(image.pixels[(115 - 11) * 576 + 218], 0);
    assert.equal(image.pixels[(115 + 6 * 11) * 576 + 218], 0);
    for (let y = 0; y < 288; y++) for (let x = 548; x < 576; x++) assert.equal(image.pixels[y * 576 + x], 0);
  }
  const drawn = texts();
  for (const expected of ['Sat 10', 'Nothing today', 'Not paired', 'Grok Bot', 'Setup required', 'Live facts · ES/EN', 'More', 'ES ', ' EN'])
    assert.ok(drawn.includes(expected), expected);
  for (const spanish of ['Sábado', 'Toca para', 'Sin ', 'Más', 'Traducir', 'Calendario', 'Nada sonando', 'Sin notificaciones'])
    assert.ok(!drawn.some(text => text.includes(spanish)), spanish);
});

test('the Translate card says Ready with a Soniox key and the Paseo card shows connection states', () => {
  textDraws = [];
  paintHome(3, snapshot({ translateReady: true }), face);
  assert.ok(texts().includes('Ready'));
  assert.ok(!texts().includes('Translate'), 'no name line under the big icon');
  textDraws = [];
  paintHome(0, snapshot({ paseo: { configured: true, status: 'Mac unreachable', updates: [], needs: 0, working: 0 } }), face);
  assert.ok(texts().includes('Mac unreachable'));
  assert.equal(textDraws.find(draw => draw.text === 'Mac unreachable').value, 153);
  textDraws = [];
  const lastCounts = { needs: 1, failed: 0, review: 0, working: 2, background: 0, done: 3 };
  paintHome(0, snapshot({ paseo: { configured: true, status: 'Mac unreachable', updates: [], needs: 0, working: 0, lastSeenMs: NOW.getTime() - 29 * 60_000, lastCounts } }), face);
  assert.equal(textDraws.find(draw => draw.text === 'Offline').value, 153, 'the last counts, marked offline');
  assert.ok(texts().includes('Review') && texts().includes('Done'));
});

test('the Paseo card is four counts: Review, Working, Background and Done', () => {
  textDraws = [];
  const counts = { needs: 1, failed: 0, review: 1, working: 2, background: 0, done: 3 };
  const paseo = { configured: true, status: '', needs: 1, working: 2, counts, lastSeenMs: null, lastCounts: null, updates: [
    { agentId: 'a', title: 'Fix reconnect BLE', bucket: 'needs', activityMs: NOW.getTime() - 60_000, line: '¿Apruebo correr los tests de BLE?' },
  ] };
  paintHome(0, snapshot({ paseo }), face);
  const labels = textDraws.filter(draw => ['Review', 'Working', 'Background', 'Done'].includes(draw.text));
  assert.deepEqual(labels.map(draw => [draw.text, draw.value]), [['Review', 153], ['Working', 153], ['Background', 85], ['Done', 153]], 'an empty count is faint');
  assert.ok(labels[0].y === labels[1].y && labels[2].y === labels[3].y && labels[2].y > labels[0].y, 'a 2×2 grid');
  assert.ok(!texts().includes('Fix reconnect BLE'), 'counts only, no agent names');
  assert.equal(textDraws.find(draw => draw.text === 'Paseo').y, 16, 'header keeps the name');
});

test('the Calendar card lists today\'s next events, with a day line for another day', () => {
  const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
  const event = (title, startMs, endMs, extra = {}) => ({ title, startMs, endMs, allDay: false, ...extra });
  const daily = event('Daily con el equipo', at(10, 10, 30), at(10, 11));
  const lunch = event('Almuerzo con Lucía', at(10, 13), at(10, 14), { location: 'Café Jardín' });
  const review = event('Review', at(10, 15), at(10, 16));
  textDraws = [];
  paintHome(2, snapshot({ calendar: calendarCardState(true, [daily, lunch, review], NOW.getTime()) }), face);
  let drawn = texts();
  assert.ok(drawn.includes('Daily con el equipo'));
  assert.ok(drawn.includes('10:30 - 11:00'));
  assert.ok(drawn.includes('Almuerzo con Lucía'));
  assert.ok(drawn.includes('13:00 - 14:00'));
  assert.ok(!drawn.includes('Review'), 'two events per card');
  textDraws = [];
  paintHome(2, snapshot({ calendar: calendarCardState(true, [lunch, review], NOW.getTime()) }), face);
  drawn = texts();
  assert.ok(drawn.includes('Café Jardín'), 'the first event keeps its location line');
  assert.ok(drawn.includes('Review'));
  assert.ok(drawn.includes('15:00 - 16:00'));
  const dentist = event('Dentist', at(11, 9), at(11, 10));
  const whole = event('Feriado', at(12, 0), at(13, 0), { allDay: true });
  textDraws = [];
  paintHome(2, snapshot({ calendar: calendarCardState(true, [dentist], NOW.getTime()) }), face);
  drawn = texts();
  assert.ok(drawn.includes('Tomorrow'));
  assert.ok(drawn.includes('Dentist'));
  assert.ok(drawn.includes('09:00 - 10:00'));
  textDraws = [];
  paintHome(2, snapshot({ calendar: calendarCardState(true, [whole], NOW.getTime()) }), face);
  drawn = texts();
  assert.ok(drawn.includes('Mon, Oct 12'));
  assert.ok(drawn.includes('All day'));
  textDraws = [];
  paintHome(2, snapshot({ calendar: calendarCardState(true, [], NOW.getTime()) }), face);
  assert.ok(texts().includes('Nothing today'));
  textDraws = [];
  paintHome(2, snapshot({ calendar: calendarCardState(false, [daily], NOW.getTime()) }), face);
  assert.ok(texts().includes('No calendar access'));
});

test('the column shows weather and Paseo needs only when there is a value, inside the 212 px column', () => {
  const paseo = { configured: true, status: '', updates: [], needs: 2, working: 0 };
  textDraws = [];
  paintHome(0, snapshot({ paseo, battery: { ring: 72, glasses: 88 }, weather: { temperatureC: 27.4, code: 2, isDay: true, atMs: NOW.getTime() } }), face);
  const column = textDraws.filter(draw => draw.width === 212);
  assert.deepEqual(column.map(draw => draw.text), ['Sat 10', '27°', '2']);
  assert.ok(column.every(draw => draw.value === 255));
  assert.equal(column[0].y, 12);
  assert.equal(column[1].y, 248);
  assert.equal(column[2].y, 248);
  assert.ok(column[1].x + font.measureText('27°') < column[2].x - 20, 'weather and needs keep a gap');
  textDraws = [];
  paintHome(0, snapshot({ paseo: { ...paseo, needs: 0 } }), face);
  assert.deepEqual(textDraws.filter(draw => draw.width === 212).map(draw => draw.text), ['Sat 10']);
  textDraws = [];
  paintHome(0, snapshot({ paseo: { ...paseo, configured: false }, weather: { temperatureC: 27.4, code: 2, isDay: true, atMs: NOW.getTime() } }), face);
  assert.deepEqual(textDraws.filter(draw => draw.width === 212).map(draw => draw.text), ['Sat 10', '27°']);
});

test('the column puts the next event under the clock (time white, title dim and cut) and rain with its hour in the weather slot', () => {
  const daily = { title: 'Daily con el equipo de soporte', startMs: new Date(2026, 9, 10, 10, 30).getTime(), endMs: new Date(2026, 9, 10, 11, 0).getTime(), allDay: false };
  const weather = { temperatureC: 27.4, code: 3, isDay: true, atMs: NOW.getTime(), precipitation: [{ atMs: new Date(2026, 9, 10, 15, 0).getTime(), percent: 60 }] };
  textDraws = [];
  const image = paintHome(0, snapshot({ calendar: calendarCardState(true, [daily], NOW.getTime()), weather }), face).withDrawsBaked();
  const column = textDraws.filter(draw => draw.width === 212);
  assert.deepEqual(column.map(draw => [draw.text.replace(/…$/, '...'), draw.value]).slice(1),
    [['10:30', 255], [column[2].text.replace(/…$/, '...'), 153], ['60%', 255], ['15:00', 153]]);
  assert.ok(column[2].text.endsWith('…') && 'Daily con el equipo de soporte'.startsWith(column[2].text.slice(0, -1)), column[2].text);
  assert.equal(column[1].y, column[2].y);
  assert.ok(column[1].y > 160 && column[1].y + font.lineHeight < 248, 'the line sits between the clock and the bottom row');
  let bar = 0;
  for (let x = 0; x < 212; x++) if (image.getPixel(x, 161)) bar++;
  assert.ok(bar > 150, `the countdown track spans the clock (${bar} px)`);
});

test('long titles are clipped to the card and never overflow', () => {
  textDraws = [];
  const long = 'Reunión larguísima de planificación trimestral con todo el equipo de producto y diseño';
  const start = NOW.getTime() + 3_600_000;
  const calendar = calendarCardState(true, [
    { title: 'Daily', startMs: NOW.getTime() + 600_000, endMs: NOW.getTime() + 1_200_000 },
    { title: long, startMs: start, endMs: start + 3_600_000 },
  ], NOW.getTime());
  paintHome(2, snapshot({ calendar }), face);
  const clipped = textDraws.find(draw => draw.text.startsWith('Reunión'));
  assert.ok(clipped.text.endsWith('…'));
  assert.ok(font.measureText(clipped.text) <= 278);
});

test('the Grok Bot card shows the two most relevant updates (who dim, line white, at most two lines) or a centred status', () => {
  const bots = { status: 'Ask Grok Bot anything', updates: [
    { bot: 'Glasses', who: 'now', line: 'Hay uno a $62 el jueves 07:10 en Avianca; el tuyo cuesta $89 y el cambio no cobra multa.' },
    { bot: 'Research', who: 'working 4 min', line: 'Comparando Google y Mapbox.' },
  ] };
  textDraws = [];
  paintHome(1, snapshot({ bots }), face);
  const card = textDraws.filter(draw => draw.x === 20);
  assert.equal(textDraws.find(draw => draw.text === 'Grok Bot').y, 16, 'header');
  assert.deepEqual(card.map(draw => draw.value), [153, 255, 255, 153, 255]);
  assert.equal(card[0].text, 'now');
  assert.ok(card[2].text.endsWith('…'), 'the long line is cut at two lines');
  assert.equal(card[3].text, 'working 4 min');
  assert.ok(card.at(-1).y + font.lineHeight <= 254);
  textDraws = [];
  paintHome(1, snapshot({ bots: { status: 'Ask Grok Bot anything', updates: [] } }), face);
  assert.ok(texts().includes('Ask Grok Bot anything'));
  assert.equal(textDraws.find(draw => draw.text === 'Ask Grok Bot anything').value, 153);
});
