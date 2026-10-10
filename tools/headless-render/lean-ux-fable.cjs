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
const CONTENT_BOTTOM = FOOTER_TOP - 8;
const outDir = path.join(__dirname, 'out');

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
  console.log(file);
}

async function main() {
  const face = await stockFont(graphics);
  const clockFont = TtfFont.load(adapter.fontPath, 80);
  const clockFace = { lineHeight: clockFont.lineHeight, measureLine: (t) => clockFont.measureText(t), drawText: (...a) => clockFont.drawText(...a) };
  const icon = (image, name, x, y, size = 24, value = 255) => image.drawImage(art.icon(graphics, name, size).dimmed(value / 255), x, y);
  const text = (image, x, y, label, value = 255, width = image.width - x) => {
    assert.ok(face.measureLine(label) <= width, `overflow: ${label}`);
    assert.ok(y >= 0 && y + face.lineHeight <= image.height, `outside: ${label}`);
    face.drawText(image, x, y, label, value);
  };
  const centered = (image, y, label, value = 255) => text(image, Math.round((image.width - face.measureLine(label)) / 2), y, label, value);
  const wrap = (label, width) => {
    const lines = [];
    let line = '';
    for (const word of label.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (face.measureLine(next) <= width) line = next;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines;
  };

  const now = new Date(2026, 9, 10, 9, 41);
  const events = [{ title: 'Daily con el equipo', startMs: new Date(2026, 9, 10, 10, 30).getTime(), endMs: new Date(2026, 9, 10, 11, 0).getTime(), allDay: false }];
  // Horizonte column from production; the right half is repainted with the lean card set.
  const homeBase = () => {
    const home = paintHome(0, { now, calendar: calendarCardState(true, events, now.getTime()), music: null, notifications: [] }, face, clockFace);
    home.fillRect(212, 0, 364, 288, 0);
    return home;
  };
  const LEAN_CARDS = 5;
  const dots = (home, selected) => {
    for (let i = 0; i < LEAN_CARDS; i++) home.fillRect(218, 120 + i * 11, i === selected ? 4 : 2, 3, i === selected ? 255 : 85);
  };
  const card = (name, iconName) => {
    const panel = new graphics.GrayImage(318, 260);
    panel.drawRoundedRect(0, 0, 318, 260, 255, 6);
    icon(panel, iconName, 20, 18);
    text(panel, 52, 16, name, 255, 246);
    return panel;
  };

  // 1 · Card 1 = Paseo: what wake shows. First row is the agent that needs you.
  {
    const home = homeBase();
    const panel = card('Paseo', 'ai');
    const updates = [
      { who: 'Fix reconnect BLE · needs you', what: '¿Apruebo correr los tests de BLE?' },
      { who: 'PR #1221 jelou-cli · 4 min', what: 'Listo para fusionar a producción.' },
    ];
    let y = 62;
    for (const u of updates) {
      text(panel, 20, y, u.who, 153, 278);
      y += PITCH;
      for (const line of wrap(u.what, 278)) { text(panel, 20, y, line, 255, 278); y += PITCH; }
      y += 14;
    }
    home.bitBlt(panel.withDrawsBaked(), 230, 14);
    dots(home, 0);
    save(home, 'lean-home-paseo');
  }

  // 2 · Card 4 = Converse: glance value without a gesture instruction.
  {
    const home = homeBase();
    const panel = card('Converse', 'people');
    icon(panel, 'people', 135, 70, 48);
    centered(panel, 136, 'Live facts · ES/EN');
    centered(panel, 185, 'Last: Café con Lucía · 14:02', 153);
    home.bitBlt(panel.withDrawsBaked(), 230, 14);
    dots(home, 3);
    save(home, 'lean-home-converse');
  }

  // Terminal frame shared by every full-screen app.
  const frame = (footer) => {
    const image = new graphics.GrayImage(576, 288);
    image.drawRoundedRect(4, 4, 568, 280, 255, 8);
    image.fillRect(14, FOOTER_TOP, 548, 1, 119);
    text(image, 22, FOOTER_TOP + 8, footer.left, 119, 300);
    if (footer.right) text(image, 554 - face.measureLine(footer.right), FOOTER_TOP + 8, footer.right, 119, 220);
    return image;
  };

  // 3 · Converse live: newest fact white, older dim; the ring highlight shows the source under the fact.
  {
    const image = frame({ left: '· Converse  ES/EN', right: '12:04' });
    const facts = [
      { text: 'Guayaquil tiene alrededor de 3 007 696 habitantes.', source: 'INEC · censo 2022' },
      { text: 'La independencia de Guayaquil fue el 9 de octubre de 1820.', source: 'Wikipedia' },
      { text: 'Soniox cobra unos US$0,18 por hora de traducción en tiempo real.', source: 'soniox.com/pricing' },
    ];
    const selected = 2;
    const blocks = facts.map((f, i) => {
      const lines = wrap(f.text, 510);
      const height = lines.length * PITCH + (i === selected ? PITCH : 0);
      return { ...f, lines, height, latest: i === facts.length - 1 };
    });
    let y = CONTENT_BOTTOM - blocks.reduce((sum, b) => sum + b.height, 0) - 18 * (blocks.length - 1);
    assert.ok(y >= 16, 'facts overflow');
    blocks.forEach((b, i) => {
      if (i === selected) text(image, 22, y, '>', 255, 20);
      b.lines.forEach((line, j) => text(image, 44, y + j * PITCH, line, b.latest ? 255 : 170, 510));
      y += b.lines.length * PITCH;
      if (i === selected) { text(image, 44, y, b.source, 119, 510); y += PITCH; }
      y += 18;
    });
    save(image, 'lean-converse-live');
  }

  // 4 · More: four fixed rows, ">" on the ring selection.
  {
    const image = frame({ left: '· More', right: '1/4' });
    const rows = [['AI Chat', 'ai'], ['Timers', 'timer'], ['Navigate', 'navigate'], ['Settings', 'settings']];
    rows.forEach(([label, name], i) => {
      const y = 24 + i * 46;
      const active = i === 0;
      if (active) text(image, 22, y + 3, '>', 255, 20);
      icon(image, name, 48, y + 3, 24, active ? 255 : 136);
      text(image, 86, y, label, active ? 255 : 136, 440);
    });
    save(image, 'lean-more-list');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
