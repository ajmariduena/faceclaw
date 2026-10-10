const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/load-typescript.cjs');
const load = loader({ Uint32Array, Int32Array, DataView, ArrayBuffer }, {
  '@nativescript/core': { knownFolders: {} },
});
const { BdfFont } = load('app/graphics/bdffont.ts');
const { paintHome: paintHomeWithClock, HOME_DOTS_TOP } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const paintHome = (index, data, textFace) => paintHomeWithClock(index, data, textFace, face);
const font = BdfFont.parse(fs.readFileSync('app/fonts/terminus/ter-u20n.bdf', 'utf8'));
let textDraws = [];
const face = {
  lineHeight: font.lineHeight,
  measureLine: text => font.measureText(text),
  drawText(image, x, y, text, value) {
    assert.ok(x >= 0 && x + font.measureText(text) <= image.width, text);
    assert.ok(y >= 0 && y + font.lineHeight <= image.height, text);
    textDraws.push({ text, value, x, y });
    font.drawText(image, x, y, text, value);
  },
};
const texts = () => textDraws.map(draw => draw.text);
const NOW = new Date(2026, 9, 10, 9, 41);
const snapshot = extra => ({ now: NOW, calendar: calendarCardState(true, [], NOW.getTime()), paseo: null, ...extra });

test('app paints one bordered card with five stable dots and Horizonte clock, in English', () => {
  textDraws = [];
  const data = snapshot();
  for (let card = 0; card < 5; card++) {
    const image = paintHome(card, data, face);
    assert.equal(image.width, 576);
    assert.equal(image.height, 288);
    assert.equal(image.pixels[14 * 576 + 250], 255);
    assert.equal(HOME_DOTS_TOP, 120);
    for (let i = 0; i < 5; i++) assert.equal(image.pixels[(120 + i * 11) * 576 + 218], i === card ? 255 : 85);
    assert.equal(image.pixels[(120 + 5 * 11) * 576 + 218], 0);
    for (let y = 0; y < 288; y++) for (let x = 548; x < 576; x++) assert.equal(image.pixels[y * 576 + x], 0);
  }
  const drawn = texts();
  for (const expected of ['Saturday, Oct 10', 'Nothing today', 'Not paired', 'Setup required', 'Live facts · ES/EN', 'Coming soon', 'More', 'ES ', ' EN'])
    assert.ok(drawn.includes(expected), expected);
  for (const spanish of ['Sábado', 'Toca para', 'Sin ', 'Más', 'Traducir', 'Calendario', 'Nada sonando', 'Sin notificaciones'])
    assert.ok(!drawn.some(text => text.includes(spanish)), spanish);
});

test('the Translate card says Ready with a Soniox key and the Paseo card shows connection states', () => {
  textDraws = [];
  paintHome(2, snapshot({ translateReady: true }), face);
  assert.ok(texts().includes('Ready'));
  assert.ok(!texts().includes('Translate'), 'no name line under the big icon');
  textDraws = [];
  paintHome(0, snapshot({ paseo: { configured: true, status: 'Mac unreachable', updates: [], needs: 0, working: 0 } }), face);
  assert.ok(texts().includes('Mac unreachable'));
  assert.equal(textDraws.find(draw => draw.text === 'Mac unreachable').value, 153);
  textDraws = [];
  paintHome(0, snapshot({ paseo: { configured: true, status: '', updates: [], needs: 0, working: 0 } }), face);
  assert.ok(texts().includes('No updates'));
});

test('the Paseo card shows two updates, needs-you first with a dim agent line and white summary lines', () => {
  textDraws = [];
  const paseo = { configured: true, status: '', needs: 1, working: 1, updates: [
    { agentId: 'a', title: 'Fix reconnect BLE', bucket: 'needs', activityMs: NOW.getTime() - 60_000, line: '¿Apruebo correr los tests de BLE?' },
    { agentId: 'b', title: 'PR #1221 jelou-cli', bucket: 'done', activityMs: NOW.getTime() - 240_000, line: 'Listo para fusionar a producción.' },
  ] };
  const image = paintHome(0, snapshot({ paseo }), face);
  assert.equal(image.width, 576);
  // Card text is drawn into the 318 px panel at x=20 (the panel lands at x=230 of the band).
  const who = textDraws.filter(draw => draw.value === 153 && draw.x === 20);
  // Terminus is wider than the stock font, so long titles clip before the tail.
  assert.ok(who[0].text.startsWith('Fix reconnect') && who[0].text.endsWith(' · needs you'), who[0].text);
  assert.ok(who[1].text.startsWith('PR #1221') && who[1].text.endsWith(' · 4 min'), who[1].text);
  assert.ok(who[0].y < who[1].y);
  const white = textDraws.filter(draw => draw.value === 255 && draw.x === 20 && draw.y > 60);
  assert.ok(white.some(draw => draw.text.startsWith('¿Apruebo')));
  assert.ok(white.some(draw => draw.text.startsWith('Listo para')));
  assert.equal(textDraws.find(draw => draw.text === 'Paseo').y, 16, 'header keeps the name');
});

test('the Calendar card lists the events after Horizonte\'s, with a day line for another day', () => {
  const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
  const event = (title, startMs, endMs, extra = {}) => ({ title, startMs, endMs, allDay: false, ...extra });
  const daily = event('Daily con el equipo', at(10, 10, 30), at(10, 11));
  const lunch = event('Almuerzo con Lucía', at(10, 13), at(10, 14), { location: 'Café Jardín' });
  const review = event('Review', at(10, 15), at(10, 16));
  textDraws = [];
  paintHome(1, snapshot({ calendar: calendarCardState(true, [daily, lunch, review], NOW.getTime()) }), face);
  let drawn = texts();
  assert.ok(drawn.includes('10:30 · in 49 min'));
  assert.ok(drawn.includes('Daily con el equipo'));
  assert.ok(drawn.includes('Almuerzo con Lucía'));
  assert.ok(drawn.includes('Café Jardín'));
  assert.ok(drawn.includes('13:00 - 14:00'));
  assert.ok(drawn.includes('Review'));
  assert.ok(drawn.includes('15:00 - 16:00'));
  const dentist = event('Dentist', at(11, 9), at(11, 10));
  const whole = event('Feriado', at(12, 0), at(13, 0), { allDay: true });
  textDraws = [];
  paintHome(1, snapshot({ calendar: calendarCardState(true, [daily, dentist], NOW.getTime()) }), face);
  drawn = texts();
  assert.ok(drawn.includes('Tomorrow'));
  assert.ok(drawn.includes('Dentist'));
  assert.ok(drawn.includes('09:00 - 10:00'));
  textDraws = [];
  paintHome(1, snapshot({ calendar: calendarCardState(true, [daily, whole], NOW.getTime()) }), face);
  drawn = texts();
  assert.ok(drawn.includes('Mon, Oct 12'));
  assert.ok(drawn.includes('All day'));
  textDraws = [];
  paintHome(1, snapshot({ calendar: calendarCardState(true, [daily], NOW.getTime()) }), face);
  assert.ok(texts().includes('Nothing else today'));
  textDraws = [];
  paintHome(1, snapshot({ calendar: calendarCardState(false, [daily], NOW.getTime()) }), face);
  assert.ok(texts().includes('No calendar access'));
});

test('long titles are clipped to the card and never overflow', () => {
  textDraws = [];
  const long = 'Reunión larguísima de planificación trimestral con todo el equipo de producto y diseño';
  const start = NOW.getTime() + 3_600_000;
  const calendar = calendarCardState(true, [
    { title: 'Daily', startMs: NOW.getTime() + 600_000, endMs: NOW.getTime() + 1_200_000 },
    { title: long, startMs: start, endMs: start + 3_600_000 },
  ], NOW.getTime());
  paintHome(1, snapshot({ calendar }), face);
  const clipped = textDraws.find(draw => draw.text.startsWith('Reunión'));
  assert.ok(clipped.text.endsWith('…'));
  assert.ok(font.measureText(clipped.text) <= 278);
});
