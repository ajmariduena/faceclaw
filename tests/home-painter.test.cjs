const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/load-typescript.cjs');
const load = loader({ Uint32Array, Int32Array, DataView, ArrayBuffer }, {
  '@nativescript/core': { knownFolders: {} },
});
const { BdfFont } = load('app/graphics/bdffont.ts');
const { paintHome: paintHomeWithClock } = load('app/apps/home/home-painter.ts');
const paintHome = (index, data, textFace) => paintHomeWithClock(index, data, textFace, face);
const font = BdfFont.parse(fs.readFileSync('app/fonts/terminus/ter-u20n.bdf', 'utf8'));
const textDraws = [];
const face = {
  lineHeight: font.lineHeight,
  measureLine: text => font.measureText(text),
  drawText(image, x, y, text, value) {
    assert.ok(x >= 0 && x + font.measureText(text) <= image.width, text);
    assert.ok(y >= 0 && y + font.lineHeight <= image.height, text);
    textDraws.push(text);
    font.drawText(image, x, y, text, value);
  },
};
const snapshot = () => ({ now: new Date(2026, 9, 7, 9, 41),
  calendar: { events: [], nextEvent: null, status: 'Sin eventos hoy' }, music: null, notifications: [] });

test('app paints one bordered v3 card with five stable dots and Horizonte clock', () => {
  const data = snapshot();
  for (let card = 0; card < 5; card++) {
    const image = paintHome(card, data, face);
    assert.equal(image.width, 576);
    assert.equal(image.height, 288);
    assert.equal(image.pixels[14 * 576 + 250], 255);
    for (let i = 0; i < 5; i++) assert.equal(image.pixels[(120 + i * 11) * 576 + 218], i === card ? 255 : 85);
    for (let y = 0; y < 288; y++) for (let x = 548; x < 576; x++) assert.equal(image.pixels[y * 576 + x], 0);
  }
  assert.ok(textDraws.includes('Nada sonando'));
  assert.ok(textDraws.includes('Sin notificaciones'));
  assert.ok(textDraws.includes('Toca para empezar'));
});

test('all seven weekdays use a Spanish text date, without status icons on the left', () => {
  const names = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  for (let day = 4; day <= 10; day++) {
    const from = textDraws.length;
    const data = { ...snapshot(), now: new Date(2026, 9, day, 0, 0) };
    const image = paintHome(1, data, face);
    assert.ok(textDraws.slice(from).some(text => text.startsWith(names[day - 4])));
    assert.ok(textDraws.slice(from).includes('00:00'));
    for (let y = 241; y < 288; y++) for (let x = 0; x < 212; x++) assert.equal(image.getPixel(x, y), 0);
  }
});

test('long real titles are clipped to the card and data changes repaint the clock', () => {
  const data = snapshot();
  data.calendar.events = [0, 1].map(id => ({ id, title: 'Reunión '.repeat(20), location: 'Sala '.repeat(20),
    startMs: data.now.getTime() + 60000, endMs: data.now.getTime() + 3600000, allDay: false }));
  const first = paintHome(0, data, face);
  data.now = new Date(2026, 9, 7, 10, 42);
  const second = paintHome(0, data, face);
  assert.notDeepEqual(first.pixels, second.pixels);
  data.music = { title: 'Canción '.repeat(30), artist: 'Artista '.repeat(30), playing: true };
  paintHome(1, data, face);
  assert.ok(textDraws.includes('Sonando'));
  assert.ok(textDraws.some(text => text.endsWith('…')));
});

test('future Calendar card keeps the empty-today label and fits the next all-day event', () => {
  const data = snapshot();
  data.calendar.nextEvent = { title: 'Independencia de Guayaquil', allDay: true,
    startMs: new Date(2026, 9, 9).getTime(), endMs: new Date(2026, 9, 10).getTime() };
  const from = textDraws.length;
  paintHome(0, data, face);
  const drawn = textDraws.slice(from);
  assert.ok(drawn.includes('Sin eventos hoy'));
  assert.ok(drawn.includes('Próximo: Vie 9/10'));
  assert.ok(drawn.includes('Independencia de Guayaquil'));
  assert.ok(drawn.includes('Todo el día'));
  data.calendar.nextEvent.title = 'Una reunión con un nombre extremadamente largo que ocupa más de dos líneas';
  paintHome(0, data, face);
});


test('Horizonte leaves all five existing right cards and pagination pixels unchanged', () => {
  const expected = [
    "6ee8264e1a1c2d4af49f43a20d7b3e0c83a7c11ee8d2c3a53d2e015505dc8585",
    "5c5493a43ae99178b9f0b05ad709c06d8c13ee47148428ff1370fecdebba487e",
    "10891bfaa518727befa7db8595c4e7de725faaf8310185f62a54b380da3dfc42",
    "58a99c950082b0a1a1831bdbf1c8e4f77c679fd9b0df723d900797087550b011",
    "c926e8b7b629dcfc0c3c53a00b08b77d309832fcad65fc31b12e299f88d1775f"
];
  const crypto = require('node:crypto');
  for (let index = 0; index < 5; index++) {
    const image = paintHome(index, snapshot(), face), pixels = [];
    for (let y = 0; y < 288; y++) pixels.push(...image.pixels.slice(y * 576 + 218, (y + 1) * 576));
    assert.equal(crypto.createHash('sha256').update(Buffer.from(pixels)).digest('hex'), expected[index]);
  }
});
