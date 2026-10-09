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

  // 1 · Widget on the v3 home.
  {
    const now = new Date(2026, 9, 8, 8, 40);
    const events = [{ title: 'Daily con el equipo', startMs: new Date(2026, 9, 8, 9, 30).getTime(), endMs: new Date(2026, 9, 8, 10, 0).getTime(), allDay: false }];
    const home = paintHome(0, { now, calendar: calendarCardState(true, events, now.getTime()), music: null, notifications: [] }, face, clockFace);
    home.fillRect(212, 0, 364, 288, 0);
    const panel = new graphics.GrayImage(318, 260);
    panel.drawRoundedRect(0, 0, 318, 260, 255, 6);
    icon(panel, 'ai', 20, 18);
    text(panel, 52, 16, 'Paseo', 255, 246);
    const updates = [
      { who: 'Fix reconnect BLE · 1 min', what: '¿Apruebas correr los tests de BLE?' },
      { who: 'PR #1221 jelou-cli · 4 min', what: 'Listo para fusionar a producción.' },
    ];
    let y = 62;
    for (const u of updates) {
      text(panel, 20, y, u.who, 153, 278);
      y += 27;
      for (const line of wrap(u.what, 278)) { text(panel, 20, y, line, 255, 278); y += 27; }
      y += 14;
    }
    home.bitBlt(panel.withDrawsBaked(), 230, 14);
    for (let i = 0; i < 6; i++) home.fillRect(218, 115 + i * 11, i === 1 ? 4 : 2, 3, i === 1 ? 255 : 85);
    save(home, 'paseo-simple-widget');
  }

  // 2 · Paseo sections, like the desktop sidebar.
  {
    const image = new graphics.GrayImage(576, 288);
    icon(image, 'ai', 22, 17);
    text(image, 54, 14, 'Paseo');
    const rows = [
      { section: 'Pinned' },
      { title: 'Faceclaw v3 home' },
      { section: 'Needs input' },
      { title: 'Fix reconnect after BLE drop', selected: true },
      { section: 'Ready to review' },
      { title: 'Revisar PR #1221 jelou-cli' },
      { title: 'Analizar repositorio Hello QA' },
      { section: 'Working' },
    ];
    let y = 46;
    for (const row of rows) {
      if (row.section) {
        text(image, 22, y + 2, row.section, 120, 300);
        y += 26;
        continue;
      }
      if (row.selected) image.drawRoundedRect(18, y - 1, 540, 31, 255, 6);
      text(image, 40, y + 1, row.title, row.selected ? 255 : 190, 500);
      y += 31;
    }
    save(image, 'paseo-simple-sections');
  }

  // 3 · Chat with Luna summaries.
  {
    const image = new graphics.GrayImage(576, 288);
    text(image, 22, 14, 'Fix reconnect after BLE drop', 255, 532);
    image.fillRect(22, 46, 532, 1, 68);
    const turns = [
      { who: 'you', text: 'Arregla la reconexión tras un corte de BLE.' },
      { who: 'agent', text: 'La causa: se reusaba la conexión muerta.' },
      { who: 'agent', text: 'Lo arreglé y agregué reintentos de 1 a 30 s.' },
    ];
    let y = 58;
    for (const turn of turns) {
      for (const line of wrap(turn.text, turn.who === 'you' ? 500 : 532)) {
        const x = turn.who === 'you' ? 554 - face.measureLine(line) : 22;
        text(image, x, y, line, turn.who === 'you' ? 136 : 255, 532);
        y += 27;
      }
      y += 8;
    }
    image.drawRoundedRect(18, 222, 540, 46, 255, 6);
    text(image, 36, 233, 'Run npm test -- ble-session', 255, 400);
    text(image, 554 - 18 - face.measureLine('Approve'), 233, 'Approve', 255, 120);
    save(image, 'paseo-simple-chat');
  }

  // 4 · Chat in the Even terminal-mode style: one rounded box, ">" steps, white replies, status footer.
  const terminal = (name, entries, footer, permission, style = null) => {
    const image = new graphics.GrayImage(576, 288);
    image.drawRoundedRect(4, 4, 568, 280, 255, 8);
    const left = style ? 30 : 22;
    const right = style ? 546 : 554;
    const bubble = style === 'bubble';
    const indent = 20;
    const blocks = entries.map((entry) => {
      const value = entry.kind === 'reply' ? 255 : entry.kind === 'you' ? 150 : 120;
      const width = entry.kind === 'you' ? right - left - 60 : entry.kind === 'step' ? right - left - indent : right - left;
      return wrap(entry.text, width).map((line, i) => ({ kind: entry.kind, prefix: entry.kind === 'step' && i === 0 ? '>' : '', line, value }));
    });
    const footerTop = footer ? 288 - 4 - 40 : 284;
    let boxTop = footerTop;
    let permLines = [];
    if (permission) {
      permLines = wrap(permission.question, right - left - 16);
      boxTop = footerTop - 10 - (permLines.length + permission.options.length) * 27 - 18;
    }
    const gap = style ? 16 : 8;
    const top = style ? 20 : 14;
    const pad = (block) => (bubble && block[0]?.kind === 'you' ? 10 : 0);
    const shown = [];
    let used = 0;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const height = blocks[i].length * 27 + pad(blocks[i]) + (shown.length ? gap : 0);
      if (used + height > boxTop - top - (style ? 6 : 0)) break;
      shown.unshift(blocks[i]);
      used += height;
    }
    let y = top;
    for (const block of shown) {
      const inset = bubble && block[0]?.kind === 'you' ? 12 : 0;
      if (inset) {
        const width = Math.max(...block.map((b) => face.measureLine(b.line))) + inset * 2;
        image.drawRoundedRect(right + inset - width, y - 3, width, block.length * 27 + 8, 102, 8);
        y += 2;
      }
      for (const { kind, prefix, line, value } of block) {
        if (prefix) text(image, left, y, prefix, value, 20);
        const x = kind === 'you' ? right - face.measureLine(line) : prefix ? left + indent : left;
        text(image, x, y, line, value, right - left);
        y += 27;
      }
      y += gap + (inset ? 8 : 0);
    }
    if (permission) {
      image.drawRoundedRect(14, boxTop, 548, footerTop - 8 - boxTop, 255, 6);
      let py = boxTop + 8;
      for (const line of permLines) { text(image, 28, py, line, 255, 520); py += 27; }
      permission.options.forEach((option, i) => {
        if (i === 0) text(image, 28, py, '>', 255, 20);
        text(image, 48, py, option, i === 0 ? 255 : 120, 500);
        py += 27;
      });
    }
    if (footer) {
      image.fillRect(14, footerTop, 548, 1, 120);
      text(image, left, footerTop + 8, footer.left, 120, 300);
      if (footer.right) text(image, right - face.measureLine(footer.right), footerTop + 8, footer.right, 120, 200);
    }
    save(image, name);
  };
  const conversation = [
    { kind: 'you', text: 'Arregla la reconexión tras un corte de BLE.' },
    { kind: 'step', text: 'Read 4 files, edited ble-session.ts' },
    { kind: 'reply', text: 'La causa: se reusaba la conexión muerta.' },
    { kind: 'step', text: 'Ran 2 commands' },
    { kind: 'reply', text: 'Lo arreglé y agregué reintentos de 1 a 30 s.' },
  ];
  terminal('paseo-term-working', conversation, { left: '· Working', right: '12s' });
  terminal('paseo-term-permission', conversation.slice(1, 4), null, {
    question: 'Allow Claude to run npm test -- ble-session?',
    options: ['Allow once', 'Always allow for this session', 'Deny'],
  });
  terminal('paseo-term-done', [
    ...conversation,
    { kind: 'step', text: 'Ran npm test -- ble-session' },
    { kind: 'reply', text: 'Los 18 tests pasan; listo para commit.' },
  ], { left: '· Done', right: '2m 14s' });

  // 5 · Real sessions from the local Paseo daemon, condensed by Luna (tools/paseo-probe/real-sessions.mjs).
  const realFile = process.env.PASEO_REAL ?? '/tmp/paseo-real.json';
  if (fs.existsSync(realFile)) {
    const real = JSON.parse(fs.readFileSync(realFile, 'utf8'));
    const image = new graphics.GrayImage(576, 288);
    image.drawRoundedRect(4, 4, 568, 280, 255, 8);
    const footerTop = 288 - 4 - 40;
    let y = 14;
    let first = true;
    for (const section of real.sections) {
      if (y + 27 * 2 > footerTop) break;
      const count = String(section.agents.length);
      text(image, 22, y, section.name, 120, 400);
      text(image, 554 - face.measureLine(count), y, count, 120, 60);
      y += 27;
      for (const title of section.agents.slice(0, 3)) {
        if (y + 27 > footerTop) break;
        const label = (() => {
          let t = title;
          while (face.measureLine(t) > 492) t = t.slice(0, -1);
          return t === title ? t : `${t.trimEnd()}…`;
        })();
        if (first) text(image, 22, y, '>', 255, 20);
        text(image, 42, y, label, first ? 255 : 190, 500);
        first = false;
        y += 27;
      }
    }
    image.fillRect(14, footerTop, 548, 1, 120);
    text(image, 22, footerTop + 8, '· Paseo', 120, 200);
    const total = real.sections.map((s) => `${s.agents.length} ${s.name.split(' ')[0].toLowerCase()}`).join(' · ');
    text(image, 554 - face.measureLine(total), footerTop + 8, total, 120, 330);
    save(image, 'paseo-real-sections');
    real.sessions.forEach((session, i) => {
      const minutes = session.activeSince ? Math.max(1, Math.round((Date.parse(session.updatedAt) - Date.parse(session.activeSince)) / 60000)) : null;
      const footer = session.status === 'running'
        ? { left: '· Working', right: minutes ? `${minutes}m` : '' }
        : { left: `· ${session.bucket}`, right: `${session.sourceWords} → ${session.entries.filter((e) => e.kind !== 'step').reduce((n, e) => n + e.text.split(/\s+/).length, 0)} words` };
      const chat = session.entries.filter((e) => e.kind !== 'step');
      terminal(`paseo-real-chat-${i + 1}`, chat, footer);
      terminal(`paseo-real-chat-${i + 1}-airy`, chat, footer, null, 'airy');
      terminal(`paseo-real-chat-${i + 1}-bubble`, chat, footer, null, 'bubble');
      if (process.env.PASEO_DICTATION) {
        terminal(`paseo-real-chat-${i + 1}-dictating`, [...chat, { kind: 'you', text: process.env.PASEO_DICTATION }], { left: '· Listening', right: '0:04' });
      }
    });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
