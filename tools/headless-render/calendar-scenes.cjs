const assert = require('node:assert/strict');

process.env.TZ = 'America/Guayaquil';
const NOW = Date.parse('2026-10-07T09:41:00-05:00');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}

const events = [
  { id: 1, title: 'Reunión del equipo', startMs: Date.parse('2026-10-07T10:30:00-05:00'), endMs: Date.parse('2026-10-07T11:00:00-05:00'), allDay: false, location: 'Videollamada', calendarName: 'Trabajo' },
  { id: 2, title: 'Revisión de diseño', startMs: Date.parse('2026-10-07T14:00:00-05:00'), endMs: Date.parse('2026-10-07T15:00:00-05:00'), allDay: false, location: 'Sala Norte', calendarName: 'Trabajo' },
  { id: 3, title: 'Entrega de propuesta', startMs: Date.parse('2026-10-08T00:00:00-05:00'), endMs: Date.parse('2026-10-09T00:00:00-05:00'), allDay: true, location: '', calendarName: 'Trabajo' },
  { id: 4, title: 'Planificación semanal', startMs: Date.parse('2026-10-08T09:30:00-05:00'), endMs: Date.parse('2026-10-08T10:30:00-05:00'), allDay: false, location: 'Sala Centro', calendarName: 'Trabajo' },
];

function renderCalendar(context, mode) {
  const { graphics, load, rect, TtfFont, adapter, truncateText } = context;
  const { CalendarLayer, formatEventTime } = load('app/apps/calendar/calendar.ts');
  const layerContext = { stack: { getBaseSize: () => rect, isFocused: () => true } };
  let band;
  if (mode === 'calendar') {
    const layer = new CalendarLayer(() => { throw new Error('Fixture already has permission'); });
    band = layer.paint(layerContext).withDrawsBaked();
    layer.handleInput({ type: 'click', source: 'ring' });
    assert.deepEqual(layer.paint(layerContext).withDrawsBaked().pixels, band.pixels, 'Calendar tap must not open an invented detail');
    layer.handleInput({ type: 'scroll-down', source: 'ring' });
    assert.notDeepEqual(layer.paint(layerContext).withDrawsBaked().pixels, band.pixels, 'Calendar scroll changes selection');
    layer.handleInput({ type: 'scroll-up', source: 'ring' });
    assert.deepEqual(layer.paint(layerContext).withDrawsBaked().pixels, band.pixels);
  } else {
    band = new graphics.GrayImage(rect.width, rect.height);
    const title = TtfFont.load(adapter.fontPath, 22);
    const body = TtfFont.load(adapter.fontPath, 20);
    const time = TtfFont.load(adapter.fontPath, 16);
    const small = TtfFont.load(adapter.fontPath, 14);
    band.drawText(title, 20, 8, 'Calendario', 255);
    band.drawText(time, 522, 13, '1 / 4', 153);
    let y = 43;
    let previousDay = '';
    for (const [index, event] of events.entries()) {
      const date = new FixedDate(event.startMs);
      const day = date.toDateString();
      if (day !== previousDay) {
        if (previousDay) y += 2;
        const label = date.getDate() === 7 ? 'HOY · MIÉRCOLES 7 OCT' : 'MAÑANA · JUEVES 8 OCT';
        band.drawText(small, 22, y, label, 153);
        y += 23;
        previousDay = day;
      }
      const height = event.location ? 48 : 32;
      if (index === 0) band.drawRoundedRect(16, y, 544, height, 238, 8);
      band.drawText(time, 30, y + 5, event.allDay ? 'Todo el día' : formatEventTime(event.startMs), index === 0 ? 221 : 170);
      const text = truncateText(body, event.title, 408);
      assert.equal(text, event.title);
      band.drawText(body, 132, y + 1, text, index === 0 ? 255 : 204);
      if (event.location) band.drawText(small, 132, y + 27, event.location, 153);
      assert.ok(y + height <= 288, 'Calendar event must fit in the band');
      y += height + 4;
    }
    band = band.withDrawsBaked();
  }
  const output = new graphics.GrayImage(640, 480);
  output.bitBlt(band, rect.x, rect.y);
  return { output, name: mode, viewport: rect, font: 'Roboto Light', renderer: mode === 'calendar' ? 'production CalendarLayer' : 'proposed painter / production primitives and time formatter', fixture: '2026-10-07 09:41 America/Guayaquil', events: events.length };
}

function bandFromOutput(graphics, output, rect) {
  const band = new graphics.GrayImage(rect.width, rect.height);
  for (let y = 0; y < rect.height; y++) {
    band.pixels.set(output.pixels.subarray((y + rect.y) * 640 + rect.x, (y + rect.y) * 640 + rect.x + rect.width), y * rect.width);
  }
  return band;
}

function renderTransitions(context, home, current, styled, mode) {
  const { graphics, load, rect } = context;
  const results = [];
  if (mode === 'transition') {
    for (let index = 0; index < 5; index++) {
      results.push({ output: index === 0 ? home.output : current.output, name: `transition-${index}`, state: index === 0 ? 'before tap / Calendar selected' : 'after first Calendar frame / unchanged', animationMs: 0, launchLatency: 'not measured; no frame timestamps implied' });
    }
  }
  const { DrawExpression: E } = load('app/graphics/draw-expression.ts');
  const { DrawOp, SCREEN, encodeDisplayList, readDisplayList, paintDisplayList } = load('app/graphics/display-list.ts');
  const band = bandFromOutput(graphics, styled.output, rect);
  const durationMs = 180;
  const offset = E.progress(durationMs).ease().lerp(E.f32(0), E.f32(rect.width)).toInt();
  const resources = [];
  const clip = { x: 0, y: 0, width: rect.width, height: rect.height };
  const calls = [{ op: DrawOp.RECT_COPY, resource: SCREEN, x: 0, y: 0, width: rect.width, height: rect.height, dx: offset.neg(), dy: 0, clip }];
  // A whole 576x288 image exceeds the firmware's 64 KiB packed-resource limit.
  for (const top of [0, 144]) {
    const resource = resources.length;
    resources.push({ width: rect.width, height: 144, pixels: band.pixels.slice(top * rect.width, (top + 144) * rect.width) });
    calls.push({ op: DrawOp.RECT_COPY, resource, x: 0, y: 0, width: rect.width, height: 144,
      dx: E.i32(rect.width).sub(offset), dy: top, clip });
  }
  const displayList = { resources, calls, timeline: { token: 1, startedAt: NOW } };
  const encoded = encodeDisplayList({ displayList, x: rect.x, y: rect.y, width: rect.width, height: rect.height, depth: 0 }, NOW);
  const { placed, end } = readDisplayList(encoded, 0, NOW);
  assert.equal(end, encoded.length);
  for (const [index, elapsedMs] of [0, 45, 90, 135, 180].entries()) {
    const output = new graphics.GrayImage(640, 480);
    paintDisplayList(output.pixels, home.output.pixels, 640, 480, placed, false, NOW + elapsedMs);
    if (index === 0 || elapsedMs === durationMs) {
      const expected = (index === 0 ? home : styled).output;
      assert.ok(output.pixels.every((value, i) => graphics.grayToNibble(value) === graphics.grayToNibble(expected.pixels[i])), 'Transition endpoints must match still frames');
    }
    results.push({ output, name: `transition-even-${index}`, elapsedMs, durationMs, easing: 'smoothstep', renderer: 'production encode/decode/paintDisplayList', packedResourcesBytes: resources.reduce((n, r) => n + 5 + r.width / 2 * r.height, 0) });
  }
  return results;
}

module.exports = { FixedDate, events, renderCalendar, renderTransitions };
