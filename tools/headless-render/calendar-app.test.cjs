/**
 * Calendar app screens through the production layers and painters
 * (app/apps/calendar) and the extracted stock font: the agenda today, after
 * scrolling into the next days, an empty day, an event's detail and the
 * permission prompt. Writes out/calendar-app-*.png for eyeballing against
 * calendar-terminal.cjs (English chrome) and checks the geometry it fixed.
 *
 *   node --test tools/headless-render/calendar-app.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { loader } = require('../../tests/helpers/load-typescript.cjs');

const context = createRenderContext();
const { graphics, load } = context;
const facePromise = stockFont(graphics);
const outDir = path.join(__dirname, 'out');

const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();
const EVENTS = [
  { id: 4, title: 'Independencia de Guayaquil', startMs: at(9, 0, 0), endMs: at(10, 0, 0), allDay: true, location: '', calendarName: 'Feriados' },
  { id: 1, title: 'Daily con el equipo', startMs: at(9, 9, 0), endMs: at(9, 9, 30), allDay: false, location: 'Meet', calendarName: 'Trabajo' },
  { id: 2, title: 'Revisión del plan de soporte', startMs: at(9, 9, 30), endMs: at(9, 10, 30), allDay: false, location: 'Sala Norte', calendarName: 'Trabajo',
    notes: '<p>Revisar los tickets abiertos de WhatsApp y decidir quién toma la guardia del fin de semana.</p><br>-::~:~::~:~:~:~:~:~::~:~::-<br>Join with Google Meet: https://meet.google.com/abc-defg-hij' },
  { id: 3, title: 'Almuerzo con Nessa', startMs: at(9, 13, 30), endMs: at(9, 14, 30), allDay: false, location: 'Café de siempre', calendarName: 'Personal' },
  { id: 5, title: 'Llamada con proveedores de soporte para el plan del próximo trimestre', startMs: at(9, 16, 0), endMs: at(9, 17, 0), allDay: false, location: '', calendarName: 'Trabajo' },
  { id: 6, title: 'Demo de Paseo en las gafas', startMs: at(10, 10, 0), endMs: at(10, 11, 0), allDay: false, location: 'Casa', calendarName: 'Personal' },
  { id: 7, title: 'Fútbol', startMs: at(10, 18, 0), endMs: at(10, 19, 30), allDay: false, location: 'Cancha Samanes', calendarName: 'Personal' },
  { id: 8, title: 'Daily con el equipo', startMs: at(12, 9, 30), endMs: at(12, 10, 0), allDay: false, location: 'Meet', calendarName: 'Trabajo' },
];
const ATTENDEES = { 2: ['Ricardo Pérez', 'Hayleen', 'Nessa'] };

function save(band, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  return file;
}

function tracing(face) {
  const draws = [];
  return {
    draws,
    face: {
      lineHeight: face.lineHeight,
      measureLine: (text) => face.measureLine(text),
      drawText: (image, x, y, text, value = 255) => {
        assert.ok(x >= 0 && x + face.measureLine(text) <= 576, `overflow: ${text}`);
        assert.ok(y >= 0 && y + face.lineHeight <= 288, `outside: ${text}`);
        draws.push({ x, y, text, value });
        face.drawText(image, x, y, text, value);
      },
    },
  };
}

/** The production CalendarLayer with the calendar provider, permission, clock and time format stubbed. */
function calendarApp(face, { nowMs, events = EVENTS, permitted = true, timeFormat = '24h' }) {
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [nowMs])); }
    static now() { return nowMs; }
  }
  const requests = [];
  const appLoad = loader({ Date: Clock, console }, {
    '../../graphics/image': graphics,
    '../../native/calendar': {
      readAgendaEvents: (from, to) => events.filter((e) => e.endMs > from && e.startMs < to),
      readEventAttendees: (id) => ATTENDEES[id] ?? [],
      getCalendarReadState: () => 'ready',
    },
    '../../native/calendar-permissions': { hasCalendarPermission: () => permitted },
    '../../ui/dashboard-settings': { timeFormatSetting: { get: () => timeFormat } },
    '../../ui/gestures': {},
    '../../ui/layers': {},
    '../../native/texture-atlas': { textureAtlasAvailable: () => false },
  });
  const { CalendarLayer } = appLoad('app/apps/calendar/calendar.ts');
  const traced = tracing(face);
  const layers = [];
  const ctx = {
    stack: {
      getBaseSize: () => ({ width: 576, height: 288 }),
      push: (layer) => layers.push(layer),
      pop: () => layers.pop(),
    },
  };
  layers.push(new CalendarLayer(() => requests.push(1), () => traced.face));
  return {
    requests,
    layers,
    input: (type) => layers.at(-1).handleInput({ type, source: 'ring' }, ctx),
    paint: () => {
      traced.draws.length = 0;
      return { image: layers.at(-1).paint(ctx), draws: [...traced.draws] };
    },
  };
}

test('agenda today: dim heading, time column, ">" on the next event, ended events dimmer, footer counts', async () => {
  const face = await facePromise;
  const app = calendarApp(face, { nowMs: at(9, 9, 41) });
  const { image, draws } = app.paint();
  save(image, 'calendar-app-agenda');
  assert.equal(image.getPixel(4 + 8, 4), 255, 'frame top edge');
  assert.ok(draws.some((d) => d.text === 'Today · Friday, Oct 9' && d.value === 119 && d.x === 22 && d.y === 14));
  assert.ok(draws.some((d) => d.text === 'All day' && d.value === 136 && d.x === 42));
  const ended = draws.find((d) => d.text === 'Daily con el equipo');
  assert.ok(ended && ended.value === 102, 'ended event dimmer');
  assert.ok(draws.some((d) => d.text === '09:00' && d.value === 85));
  const selected = draws.find((d) => d.text === 'Revisión del plan de soporte');
  assert.ok(selected && selected.value === 255);
  assert.ok(draws.some((d) => d.text === '>' && d.x === 22 && d.y === selected.y));
  assert.ok(draws.some((d) => d.text === '09:30' && d.value === 255 && d.y === selected.y));
  assert.ok(draws.some((d) => d.text.startsWith('Llamada con proveedores') && d.text.endsWith('…')));
  assert.ok(draws.some((d) => d.text === 'Tomorrow · Saturday, Oct 10' && d.value === 119));
  assert.ok(draws.some((d) => d.text === '· Calendar' && d.y === 244 + 8));
  const footer = draws.find((d) => d.text === '1 now · 5 today');
  assert.ok(footer && footer.x + face.measureLine(footer.text) === 554);
  assert.ok(draws.filter((d) => d.y < 244).every((d) => d.y + 27 <= 244), 'rows stay above the footer rule');
  assert.ok(!draws.some((d) => /tap|hold|press/i.test(d.text)), 'no gesture hints');
});

test('scrolling down moves past today into the next days, stopping at the last event', async () => {
  const face = await facePromise;
  const app = calendarApp(face, { nowMs: at(9, 9, 41) });
  app.input('scroll-up');
  app.input('scroll-up');
  let { draws } = app.paint();
  assert.ok(draws.some((d) => d.text === 'Independencia de Guayaquil' && d.value === 255), 'scroll up reaches the all-day event');
  for (let i = 0; i < 5; i++) app.input('scroll-down');
  const tomorrow = app.paint();
  save(tomorrow.image, 'calendar-app-tomorrow');
  draws = tomorrow.draws;
  assert.ok(draws.some((d) => d.text === 'Demo de Paseo en las gafas' && d.value === 255));
  assert.ok(draws.some((d) => d.text === 'Tomorrow · Saturday, Oct 10' && d.value === 119));
  assert.ok(draws.some((d) => d.text === 'Sunday, Oct 11'));
  assert.ok(draws.some((d) => d.text === 'Nothing scheduled' && d.value === 102));
  assert.ok(draws.some((d) => d.text === '2 tomorrow'));
  for (let i = 0; i < 10; i++) app.input('scroll-down');
  const end = app.paint();
  save(end.image, 'calendar-app-end');
  assert.ok(end.draws.some((d) => d.text === 'Monday, Oct 12'));
  assert.ok(end.draws.some((d) => d.text === 'Daily con el equipo' && d.value === 255));
  assert.ok(end.draws.some((d) => d.text === '1 on Monday'));
});

test('an empty today says "Nothing scheduled" and the next day follows', async () => {
  const face = await facePromise;
  const app = calendarApp(face, { nowMs: at(11, 8, 0) });
  const { image, draws } = app.paint();
  save(image, 'calendar-app-empty');
  assert.ok(draws.some((d) => d.text === 'Today · Sunday, Oct 11' && d.y === 14));
  assert.ok(draws.some((d) => d.text === 'Nothing scheduled' && d.y === 14 + 27));
  assert.ok(draws.some((d) => d.text === 'Tomorrow · Monday, Oct 12' && d.y === 14 + 54));
  assert.ok(draws.some((d) => d.text === 'Daily con el equipo' && d.value === 255));
  assert.ok(draws.some((d) => d.text === '0 today' || d.text === '1 tomorrow'));
  const none = calendarApp(face, { nowMs: at(11, 8, 0), events: [] }).paint();
  save(none.image, 'calendar-app-none');
  assert.ok(none.draws.some((d) => d.text === 'Nothing scheduled'));
  assert.ok(none.draws.some((d) => d.text === '0 today'));
});

test('tap opens the event detail; double tap goes back to the agenda on the same event', async () => {
  const face = await facePromise;
  const app = calendarApp(face, { nowMs: at(9, 7, 45) });
  app.input('scroll-down');
  app.input('click');
  assert.equal(app.layers.length, 2);
  const { image, draws } = app.paint();
  save(image, 'calendar-app-event');
  assert.ok(draws.some((d) => d.text === 'Revisión del plan de soporte' && d.value === 255 && d.y === 14));
  assert.ok(draws.some((d) => d.text === '09:30 – 10:30 · Sala Norte' && d.value === 170 && d.y === 14 + 27));
  assert.ok(draws.some((d) => d.text === 'With Ricardo Pérez, Hayleen and Nessa' && d.y === 14 + 54));
  const notes = draws.filter((d) => d.value === 120 && d.y < 244);
  assert.ok(notes.length >= 2 && notes[0].text.startsWith('Revisar los tickets'), 'notes as plain text');
  assert.ok(!draws.some((d) => d.text.includes('<') || d.text.includes('~:~')));
  assert.ok(draws.some((d) => d.text === '· Event'));
  assert.ok(draws.some((d) => d.text === 'in 1 h 45 min'));
  app.input('click');
  assert.equal(app.layers.length, 2, 'no actions in the detail');
  app.input('double-click');
  assert.equal(app.layers.length, 1);
  const back = app.paint();
  assert.ok(back.draws.some((d) => d.text === 'Revisión del plan de soporte' && d.value === 255));

  const allDay = calendarApp(face, { nowMs: at(9, 9, 41) });
  allDay.input('scroll-up');
  allDay.input('scroll-up');
  allDay.input('click');
  const detail = allDay.paint();
  save(detail.image, 'calendar-app-event-allday');
  assert.ok(detail.draws.some((d) => d.text === 'All day'));
  assert.ok(detail.draws.some((d) => d.text === 'Now'));
});

test('12-hour time widens the time column; permission prompt has no gesture hint', async () => {
  const face = await facePromise;
  const twelve = calendarApp(face, { nowMs: at(9, 9, 41), timeFormat: '12h' }).paint();
  save(twelve.image, 'calendar-app-agenda-12h');
  const time = twelve.draws.find((d) => d.text === '9:30 AM');
  const title = twelve.draws.find((d) => d.text === 'Revisión del plan de soporte');
  assert.ok(time && title && title.x >= time.x + face.measureLine('10:00 AM'));
  const app = calendarApp(face, { nowMs: at(9, 9, 41), permitted: false });
  const { image, draws } = app.paint();
  save(image, 'calendar-app-permission');
  assert.ok(draws.some((d) => d.text === 'Calendar access needed' && d.value === 255));
  assert.ok(!draws.some((d) => /tap|request|●/i.test(d.text)));
  app.input('click');
  assert.equal(app.requests.length, 1);
});
