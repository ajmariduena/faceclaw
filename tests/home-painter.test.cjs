const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/load-typescript.cjs');
const load = loader({ Uint32Array, Int32Array, DataView, ArrayBuffer }, {
  '@nativescript/core': { knownFolders: {} },
});
const { BdfFont } = load('app/graphics/bdffont.ts');
const { paintHome } = load('app/apps/home/home-painter.ts');
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
const snapshot = () => ({ now: new Date(2026, 9, 7, 9, 41), battery: null, temperatureC: null,
  calendar: { events: [], status: 'Sin eventos hoy' }, music: null, notifications: [] });

test('app paints one bordered v3 card with five stable dots and dynamic stock clock', () => {
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

test('all weekdays, midnight, unknown/full battery, negative weather and large counts paint safely', () => {
  for (let day = 4; day <= 10; day++) {
    const data = { ...snapshot(), now: new Date(2026, 9, day, 0, 0), battery: day === 4 ? null : 100,
      temperatureC: -10, notifications: Array.from({ length: 120 }, () => ({ title: 'Mensaje', text: 'Hola', appName: 'App' })) };
    const image = paintHome(2, data, face);
    assert.ok(image.pixels.some(value => value !== 0));
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
