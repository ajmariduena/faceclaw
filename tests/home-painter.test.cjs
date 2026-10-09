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

test('app paints one bordered v3 card with six stable dots and Horizonte clock', () => {
  const data = snapshot();
  for (let card = 0; card < 6; card++) {
    const image = paintHome(card, data, face);
    assert.equal(image.width, 576);
    assert.equal(image.height, 288);
    assert.equal(image.pixels[14 * 576 + 250], 255);
    for (let i = 0; i < 6; i++) assert.equal(image.pixels[(115 + i * 11) * 576 + 218], i === card ? 255 : 85);
    for (let y = 0; y < 288; y++) for (let x = 548; x < 576; x++) assert.equal(image.pixels[y * 576 + x], 0);
  }
  assert.ok(textDraws.includes('Nada sonando'));
  assert.ok(textDraws.includes('Toca para emparejar'));
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
  paintHome(2, data, face);
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


test('the five original cards are unchanged at their new indices, with six dots beside them', () => {
  // Card area (x >= 230) hashes of the pre-Paseo painter, verified identical when the card was added.
  const expected = {
    0: 'e323243b57beb4587536d4936c3a0875bbe777a97107791ff8df62e656fef5ee',
    2: '4526ae89c60d46ad6d5f0ce6d20f9af9d86e73327ed1311d049f5b4d3ecd8257',
    3: '9f5b2f6a403a77163678871aa69bab0f858811c4ce9e790675b98d1f0e0a07bf',
    4: 'f4430a406d530ebc9b18efbe4f93a54130dc50e2d59a7caef5eef7040e4bb950',
    5: 'a50b1a59495fccbee8b762445781d37f5600af2a1c8650168ba953c2f718a958',
  };
  const crypto = require('node:crypto');
  for (const [index, hash] of Object.entries(expected)) {
    const image = paintHome(Number(index), snapshot(), face), pixels = [];
    for (let y = 0; y < 288; y++) pixels.push(...image.pixels.slice(y * 576 + 230, (y + 1) * 576));
    assert.equal(crypto.createHash('sha256').update(Buffer.from(pixels)).digest('hex'), hash);
    for (let y = 0; y < 288; y++) for (let x = 218; x < 230; x++) {
      const dot = y >= 115 && y < 115 + 6 * 11 && (y - 115) % 11 < 3 && x < 218 + (Math.floor((y - 115) / 11) === Number(index) ? 4 : 2);
      assert.equal(image.getPixel(x, y), dot ? (Math.floor((y - 115) / 11) === Number(index) ? 255 : 85) : 0);
    }
  }
});

test('the Paseo card shows two updates with dim agent lines and white summaries, clipped to the card', () => {
  const data = snapshot();
  data.paseo = { configured: true, status: '', needs: 1, working: 0, updates: [
    { agentId: 'a', title: 'Fix reconnect BLE', bucket: 'needs', activityMs: data.now.getTime() - 60_000, line: '¿Apruebas correr los tests de BLE?' },
    { agentId: 'b', title: 'PR #1221 jelou-cli', bucket: 'review', activityMs: data.now.getTime() - 240_000, line: 'Listo para fusionar a producción. '.repeat(6) },
  ] };
  const from = textDraws.length;
  paintHome(1, data, face);
  const drawn = textDraws.slice(from);
  assert.ok(drawn.includes('Fix reconnect BLE · 1 min'));
  assert.ok(drawn.includes('PR #1221 jelou-cli · 4 min'));
  assert.ok(drawn.some(text => text.startsWith('¿Apruebas')));
  data.paseo = { configured: true, status: 'Conectando…', updates: [], needs: 0, working: 0 };
  paintHome(1, data, face);
  assert.ok(textDraws.includes('Conectando…'));
});
