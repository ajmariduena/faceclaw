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

const items = [
  { app: 'WhatsApp', who: 'Nessa', text: 'Ya etiqueté los 50 pares, te los paso por Drive.', age: '2m' },
  { app: 'Slack', who: 'Ricardo · #soporte', text: 'El deploy de Casos quedó verde, revisa cuando puedas.', age: '9m' },
  { app: 'Gmail', who: 'Banco Pichincha', text: 'Tu estado de cuenta de septiembre ya está disponible.', age: '1h' },
  { app: 'WhatsApp', who: 'Mamá', text: '¿Vienes a almorzar el domingo?', age: '3h' },
];

async function main() {
  const face = await stockFont(graphics);
  const clockFont = TtfFont.load(adapter.fontPath, 80);
  const clockFace = { lineHeight: clockFont.lineHeight, measureLine: (t) => clockFont.measureText(t), drawText: (...a) => clockFont.drawText(...a) };
  const text = (image, x, y, label, value, width) => {
    assert.ok(face.measureLine(label) <= width, `overflow: ${label}`);
    face.drawText(image, x, y, label, value);
  };
  const fit = (label, width) => {
    if (face.measureLine(label) <= width) return label;
    let t = label;
    while (face.measureLine(`${t}…`) > width) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  };
  const wrap = (label, width) => {
    const lines = [];
    let line = '';
    for (const word of label.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (face.measureLine(next) <= width) line = next; else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines;
  };
  const frame = (left, right) => {
    const image = new graphics.GrayImage(576, 288);
    image.drawRoundedRect(4, 4, 568, 280, 255, 8);
    image.fillRect(14, FOOTER_TOP, 548, 1, 119);
    text(image, 22, FOOTER_TOP + 8, left, 119, 300);
    if (right) text(image, 554 - face.measureLine(right), FOOTER_TOP + 8, right, 119, 240);
    return image;
  };

  // 1 · Home card.
  {
    const now = new Date(2026, 9, 9, 9, 5);
    const at = (h, m) => new Date(2026, 9, 9, h, m).getTime();
    const home = paintHome(0, { now, calendar: calendarCardState(true, [{ title: 'Daily con el equipo', startMs: at(9, 30), endMs: at(10, 0), allDay: false }], now.getTime()), music: null, notifications: [] }, face, clockFace);
    home.fillRect(228, 12, 322, 264, 0);
    const panel = new graphics.GrayImage(318, 260);
    panel.drawRoundedRect(0, 0, 318, 260, 255, 6);
    panel.drawImage(art.icon(graphics, 'bell', 24), 20, 18);
    text(panel, 52, 16, 'Notifications', 255, 246);
    let y = 62;
    for (const n of items.slice(0, 2)) {
      text(panel, 20, y, fit(`${n.who} · ${n.age}`, 278), 136, 278);
      wrap(n.text, 278).slice(0, 2).forEach((line, i) => text(panel, 20, y + PITCH * (i + 1), line, 255, 278));
      y += PITCH * 3 + 10;
    }
    home.bitBlt(panel.withDrawsBaked(), 230, 14);
    save(home, 'notif-term-card');
  }

  // 2 · List: sender and age dim, message white, one row each.
  {
    const image = frame('· Notifications', '4 new');
    items.forEach((n, i) => {
      const y = 14 + i * PITCH * 2 + (i ? i * 2 : 0);
      if (i === 0) text(image, 22, y, '>', 255, 20);
      const meta = `${n.app} · ${n.who}`;
      text(image, 42, y, fit(meta, 420), i === 0 ? 187 : 119, 420);
      text(image, 554 - face.measureLine(n.age), y, n.age, 119, 60);
      text(image, 42, y + PITCH, fit(n.text, 512), i === 0 ? 255 : 170, 512);
    });
    save(image, 'notif-term-list');
  }

  // 3 · Detail: full message, then the actions box.
  {
    const n = items[0];
    const image = frame(`· ${n.app}`, n.age);
    text(image, 22, 14, n.who, 255, 532);
    wrap(n.text, 532).forEach((line, i) => text(image, 22, 14 + PITCH * (i + 1), line, 204, 532));
    image.drawRoundedRect(14, 112, 548, FOOTER_TOP - 8 - 112, 255, 6);
    ['Reply by voice', 'Dismiss', 'Mute WhatsApp for 1 hour'].forEach((label, i) => {
      if (i === 0) text(image, 28, 120 + i * PITCH, '>', 255, 20);
      text(image, 48, 120 + i * PITCH, label, i === 0 ? 255 : 136, 500);
    });
    save(image, 'notif-term-detail');
  }

  // 4 · Incoming over the home, then it fades back.
  {
    const now = new Date(2026, 9, 9, 9, 5);
    const at = (h, m) => new Date(2026, 9, 9, h, m).getTime();
    const home = paintHome(0, { now, calendar: calendarCardState(true, [{ title: 'Daily con el equipo', startMs: at(9, 30), endMs: at(10, 0), allDay: false }], now.getTime()), music: null, notifications: [] }, face, clockFace).dimmed(0.25);
    home.fillRoundedRect(14, 14, 548, 120, 0, 8);
    home.drawRoundedRect(14, 14, 548, 120, 255, 8);
    text(home, 30, 24, 'WhatsApp · Nessa', 187, 400);
    text(home, 546 - face.measureLine('now'), 24, 'now', 119, 60);
    wrap(items[0].text, 516).forEach((line, i) => text(home, 30, 24 + PITCH * (i + 1), line, 255, 516));
    save(home, 'notif-term-popup');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
