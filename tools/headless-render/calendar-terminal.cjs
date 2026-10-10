const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const context = createRenderContext();
const { graphics, TtfFont, adapter, load } = context;
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const art = load('app/apps/home/stock-art.ts');
const PITCH = 27;
const FOOTER_TOP = 288 - 4 - 40;

function save(band, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  const file = path.join(__dirname, 'out', `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  console.log(file);
}

const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();
const events = [
  { title: 'Daily con el equipo', startMs: at(9, 9, 30), endMs: at(9, 10, 0), allDay: false, location: 'Meet' },
  { title: 'Revisión del plan de soporte', startMs: at(9, 11, 0), endMs: at(9, 12, 0), allDay: false, location: 'Sala Norte' },
  { title: 'Almuerzo con Nessa', startMs: at(9, 13, 30), endMs: at(9, 14, 30), allDay: false, location: 'Café de siempre' },
  { title: 'Independencia de Guayaquil', startMs: at(9, 0, 0), endMs: at(10, 0, 0), allDay: true },
  { title: 'Demo de Paseo en las gafas', startMs: at(10, 10, 0), endMs: at(10, 11, 0), allDay: false, location: 'Casa' },
  { title: 'Fútbol', startMs: at(10, 18, 0), endMs: at(10, 19, 30), allDay: false, location: 'Cancha Samanes' },
];
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

async function main() {
  const face = await stockFont(graphics);
  const clockFont = TtfFont.load(adapter.fontPath, 80);
  const clockFace = { lineHeight: clockFont.lineHeight, measureLine: (t) => clockFont.measureText(t), drawText: (...a) => clockFont.drawText(...a) };
  const text = (image, x, y, label, value, width) => {
    assert.ok(face.measureLine(label) <= width, `overflow: ${label}`);
    assert.ok(y + PITCH <= image.height + 2, `outside: ${label}`);
    face.drawText(image, x, y, label, value);
  };
  const fit = (label, width) => {
    if (face.measureLine(label) <= width) return label;
    let t = label;
    while (face.measureLine(`${t}…`) > width) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  };
  const frame = (footer) => {
    const image = new graphics.GrayImage(576, 288);
    image.drawRoundedRect(4, 4, 568, 280, 255, 8);
    image.fillRect(14, FOOTER_TOP, 548, 1, 119);
    text(image, 22, FOOTER_TOP + 8, footer.left, 119, 300);
    if (footer.right) text(image, 554 - face.measureLine(footer.right), FOOTER_TOP + 8, footer.right, 119, 240);
    return image;
  };

  // 1 · Home card: the left column already shows the next event, so the card lists what comes after it.
  {
    const now = new Date(2026, 9, 9, 9, 5);
    const home = paintHome(0, { now, calendar: calendarCardState(true, events.filter((e) => !e.allDay), now.getTime()), music: null, notifications: [] }, face, clockFace);
    home.fillRect(228, 12, 322, 264, 0);
    const panel = new graphics.GrayImage(318, 260);
    panel.drawRoundedRect(0, 0, 318, 260, 255, 6);
    panel.drawImage(art.icon(graphics, 'calendar', 24), 20, 18);
    text(panel, 52, 16, 'Calendario', 255, 246);
    const rows = [
      [hhmm(events[1].startMs), events[1].title],
      [hhmm(events[2].startMs), events[2].title],
      ['Mañana', events[4].title],
    ];
    let y = 62;
    for (const [when, title] of rows) {
      text(panel, 20, y, when, 136, 278);
      text(panel, 20, y + PITCH, fit(title, 278), 255, 278);
      y += PITCH * 2 + 10;
    }
    home.bitBlt(panel.withDrawsBaked(), 230, 14);
    save(home, 'cal-term-card');
  }

  // 2 · Agenda: day headings dim, time column dim, titles white, ">" on the selection.
  const agenda = (name, selected, footerRight) => {
    const image = frame({ left: '· Calendario', right: footerRight });
    const rows = [
      { heading: 'Hoy · Viernes 9 oct' },
      { time: 'Todo el día', title: events[3].title, i: 3 },
      { time: hhmm(events[0].startMs), title: events[0].title, i: 0, past: true },
      { time: hhmm(events[1].startMs), title: events[1].title, i: 1 },
      { time: hhmm(events[2].startMs), title: events[2].title, i: 2 },
      { heading: 'Mañana · Sábado 10 oct' },
      { time: hhmm(events[4].startMs), title: events[4].title, i: 4 },
    ];
    let y = 14;
    for (const row of rows) {
      if (y + PITCH > FOOTER_TOP - 4) break;
      if (row.heading) { text(image, 22, y, row.heading, 119, 400); y += PITCH; continue; }
      const active = row.i === selected;
      if (active) text(image, 22, y, '>', 255, 20);
      const timeLabel = row.time === 'Todo el día' ? 'Día' : row.time;
      text(image, 42, y, timeLabel, active ? 255 : row.past ? 85 : 136, 70);
      text(image, 112, y, fit(row.title, 440), active ? 255 : row.past ? 102 : 204, 440);
      y += PITCH;
    }
    save(image, name);
  };
  agenda('cal-term-agenda', 1, '1 ahora · 4 hoy');

  // 3 · Event: title in white, details dim, the next step in the nested box.
  {
    const e = events[1];
    const image = frame({ left: '· Evento', right: 'en 1 h 55 min' });
    text(image, 22, 14, e.title, 255, 532);
    text(image, 22, 14 + PITCH, `${hhmm(e.startMs)} – ${hhmm(e.endMs)} · ${e.location}`, 170, 532);
    text(image, 22, 14 + PITCH * 2, 'Con Ricardo, Hayleen y Nessa', 136, 532);
    image.drawRoundedRect(14, 112, 548, FOOTER_TOP - 8 - 112, 255, 6);
    text(image, 28, 120, '>', 255, 20);
    text(image, 48, 120, 'Avisarme 10 min antes', 255, 500);
    text(image, 48, 120 + PITCH, 'Unirme desde el teléfono', 136, 500);
    text(image, 48, 120 + PITCH * 2, 'Cómo llegar', 136, 500);
    save(image, 'cal-term-event');
  }

  // 3b · Next day: ring scroll past today lands on tomorrow's heading.
  {
    const image = frame({ left: '· Calendario', right: '2 mañana' });
    const rows = [
      { heading: 'Mañana · Sábado 10 oct' },
      { time: hhmm(events[4].startMs), title: events[4].title, sel: true },
      { time: hhmm(events[5].startMs), title: events[5].title },
      { heading: 'Domingo 11 oct' },
      { empty: 'Nada en la agenda' },
      { heading: 'Lunes 12 oct' },
      { time: '09:30', title: 'Daily con el equipo' },
    ];
    let y = 14;
    for (const row of rows) {
      if (row.heading) text(image, 22, y, row.heading, 119, 400);
      else if (row.empty) text(image, 112, y, row.empty, 102, 440);
      else {
        if (row.sel) text(image, 22, y, '>', 255, 20);
        text(image, 42, y, row.time, row.sel ? 255 : 136, 70);
        text(image, 112, y, row.title, row.sel ? 255 : 204, 440);
      }
      y += PITCH;
    }
    save(image, 'cal-term-tomorrow');
  }

  // 4 · Empty day.
  {
    const image = frame({ left: '· Calendario', right: '0 hoy' });
    text(image, 22, 14, 'Hoy · Domingo 11 oct', 119, 400);
    text(image, 22, 14 + PITCH, 'Nada en la agenda.', 255, 532);
    text(image, 22, 14 + PITCH * 3, 'Lunes 12 oct', 119, 400);
    text(image, 42, 14 + PITCH * 4, '09:30', 136, 70);
    text(image, 112, 14 + PITCH * 4, 'Daily con el equipo', 204, 440);
    save(image, 'cal-term-empty');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
