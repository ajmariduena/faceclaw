const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { loader } = require('../../tests/helpers/load-typescript.cjs');
const { COLUMN_ICONS, CARD_ICONS } = require('./home-column.cjs');

const { adapter } = createRenderContext();
let graphics;
const settingsStore = { getStringSetting: (_key, fallback) => fallback, onSettingsStoreChanged: () => () => {} };
const load = loader({ global: { isAndroid: true, isIOS: false }, Date, Uint32Array, Int32Array, DataView, ArrayBuffer }, {
  '@nativescript/core': { knownFolders: {} },
  '../native/font-renderer': { fontRenderer: adapter.fontRenderer },
  '../native/settings-store': settingsStore,
  '../../native/settings-store': settingsStore,
  './installed-fonts': { ensurePreinstalledFonts() {}, installedFontPath: () => adapter.fontPath },
  '../native/svg-rasterizer': { rasterizeSvg: (svg, size, stroke) => adapter.rasterizeSvg(svg, size, stroke, graphics.GrayImage) },
  '../native/frame-timings': { spanCurrent: (_name, fn) => fn() },
  '../native/texture-atlas': { textureGlassesAvailable: () => false },
  '../../native/calendar': { readUpcomingEvents: () => [], readAgendaEvents: () => [], readEventAttendees: () => [], getCalendarReadState: () => 'ready' },
  '../../native/calendar-permissions': { hasCalendarPermission: () => true },
  '../../ui/dashboard-settings': { timeFormatSetting: { get: () => '24h' }, developerInMoreSetting: { get: () => false } },
  '../../ui/terminal-face': { terminalFace: () => { throw new Error('painters take the face explicitly'); } },
  '../../ui/shell/shell': { shell: {} },
  '../../ui/shell/in-process-window': { createInProcessWindow: () => ({}) },
});
graphics = load('app/graphics/image.ts');
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const { renderIcon, ICON_SVGS } = load('app/graphics/icons.ts');
const { paintMoreList } = load('app/apps/launcher/more-list.ts');
const { paintTerminalList } = load('app/ui/terminal.ts');
const painter = load('app/graphics/terminal-painter.ts');

const outDir = path.join(__dirname, 'out');
const NOW = new Date(2026, 9, 10, 9, 41);
const min = (m) => NOW.getTime() - m * 60_000;
const BOT_CARD_ICON = 'sparkles';
const LEAN_CARDS = 6;

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

/** Refuse any text that leaves its image or needs a glyph the firmware font lacks. */
function tracing(face) {
  return {
    lineHeight: face.lineHeight,
    measureLine: (text) => face.measureLine(text),
    drawText: (image, x, y, text, value = 255) => {
      for (const char of text) assert.ok(char === ' ' || face.hasGlyph(char.codePointAt(0)), `missing stock glyph: ${char} in "${text}"`);
      assert.ok(x >= 0 && x + face.measureLine(text) <= image.width, `"${text}" overflows at x=${x}`);
      assert.ok(y >= 0 && y + face.lineHeight <= image.height, `"${text}" outside at y=${y}`);
      face.drawText(image, x, y, text, value);
    },
  };
}

async function main() {
  const face = tracing(await stockFont(graphics));
  await adapter.prepareIcons([...new Set([...COLUMN_ICONS, ...CARD_ICONS, BOT_CARD_ICON, 'timer', 'navigation', 'settings'])].map((name) => ICON_SVGS[name]));
  const band = () => new graphics.GrayImage(576, 288);

  const paseo = { configured: true, status: '', needs: 1, working: 1, updates: [
    { agentId: 'a1', title: 'Fix reconnect BLE', bucket: 'needs', activityMs: min(1), line: '¿Apruebo correr los tests de BLE?' },
    { agentId: 'a2', title: 'PR #1221 jelou-cli', bucket: 'review', activityMs: min(4), line: 'Listo para fusionar a producción.' },
  ] };
  const homeData = { now: NOW, calendar: calendarCardState(true, [], NOW.getTime()), paseo, battery: { ring: 60, glasses: 82 },
    weather: { temperatureC: 27.4, code: 2, isDay: true, atMs: NOW.getTime() } };

  // The Bots card uses the Paseo card's geometry (production paintHome) with six dots instead of five.
  const botsCard = (name, updates) => {
    const home = paintHome(0, homeData, face);
    home.fillRect(212, 0, 364, 288, 0);
    const panel = new graphics.GrayImage(318, 260);
    panel.drawRoundedRect(0, 0, 318, 260, 255, 6);
    panel.drawImage(renderIcon(BOT_CARD_ICON, 24), 20, 18);
    face.drawText(panel, 52, 16, 'Bots', 255);
    let y = 62;
    for (const update of updates) {
      face.drawText(panel, 20, y, painter.fitLine(face, update.who, 278), 153);
      y += 27;
      for (const line of painter.wrapCapped(face, update.line, 278, 2)) { face.drawText(panel, 20, y, line, 255); y += 27; }
      y += 14;
    }
    home.bitBlt(panel.withDrawsBaked(), 230, 14);
    for (let i = 0; i < LEAN_CARDS; i++) home.fillRect(218, 120 + i * 11, i === 1 ? 4 : 2, 3, i === 1 ? 255 : 85);
    save(home, name);
  };
  botsCard('grok-home-bots', [
    { who: 'Glasses · now', line: 'Hay uno a $62 el jueves 07:10 en Avianca; el tuyo cuesta $89.' },
    { who: 'Inbox · 2 h', line: '3 urgentes: Fly pide respuesta hoy; dos PRs esperan review.' },
  ]);
  botsCard('grok-home-bots-needs', [
    { who: 'Glasses · needs you', line: 'Needs you in Grok Bot app · approve booking' },
    { who: 'Research · working 4 min', line: 'Comparando Google y Mapbox para Navigate.' },
  ]);

  // More without the AI Chat row: the Bots card took it.
  {
    const image = band();
    paintMoreList(image, face, 0, [
      { appId: 'timer', label: 'Timers', icon: 'timer' },
      { appId: 'navigate', label: 'Navigate', icon: 'navigation' },
      { appId: 'settings', label: 'Settings', icon: 'settings' },
    ]);
    save(image, 'grok-more-list');
  }

  // Bots list: fixed phone order, state in the value column, the ring on the last-viewed bot.
  const list = (name, view) => {
    const image = band();
    paintTerminalList(image, face, view);
    save(image, name);
  };
  const bots = [
    { label: 'Glasses', value: '1 new' },
    { label: 'Research', value: 'working 4 min' },
    { label: 'Inbox', value: 'needs you · app' },
    { label: 'Quick', value: 'on phone' },
  ];
  list('grok-bots-list', { rows: bots, selected: 0, footer: { left: '· Bots', right: '1 new · 1 working' } });
  list('grok-bots-list-idle', { rows: bots.map((row, i) => ({ label: row.label, value: i === 3 ? 'on phone' : '' })), selected: 1, footer: { left: '· Bots', right: '' } });
  list('grok-bots-list-unreachable', { rows: [], selected: -1, footer: { left: '· Bots', right: 'Offline' }, message: "Can't reach Grok Bot · retrying" });
  list('grok-bots-list-key', { rows: [], selected: -1, footer: { left: '· Bots', right: '' }, message: 'Cursor key rejected · fix on phone' });
  list('grok-bots-list-empty', { rows: [{ label: 'Quick', value: 'on phone' }], selected: 0, footer: { left: '· Bots', right: 'Add bots on phone' } });

  // Chat: production paintChat (2 wrapped lines per message, one rule above the newest).
  const chat = (name, lines, footer, permission = null) => {
    const image = band();
    painter.paintChat(image, face, { lines, scrollBack: 0, footer, permission });
    save(image, name);
  };
  const you = (text, live = false) => ({ role: 'user', text, live });
  const bot = (text) => ({ role: 'assistant', text });
  const action = (text) => ({ role: 'assistant', text: `> ${text}`, action: true });

  chat('grok-chat-atlas', [
    you('¿A qué hora sale mi vuelo del martes?'),
    bot('Sale 06:20 desde GYE; el check-in ya está abierto.'),
  ], { left: '· Glasses', right: '' });

  chat('grok-chat-draft', [
    you('¿A qué hora sale mi vuelo del martes?'),
    bot('Sale 06:20 desde GYE; el check-in ya está abierto.'),
    you('Busca si hay vuelos más baratos a Quito el jueves', true),
  ], { left: '· Glasses', right: '' }, { question: 'Draft', options: ['Send', 'Edit', 'Discard'], selected: 0 });

  chat('grok-chat-sent', [
    you('¿A qué hora sale mi vuelo del martes?'),
    bot('Sale 06:20 desde GYE; el check-in ya está abierto.'),
    you('Busca si hay vuelos más baratos a Quito el jueves'),
  ], { left: '· Working', right: '0:12' });

  chat('grok-chat-ack', [
    you('¿A qué hora sale mi vuelo del martes?'),
    bot('Sale 06:20 desde GYE; el check-in ya está abierto.'),
    you('Busca si hay vuelos más baratos a Quito el jueves'),
    bot('Busco vuelos, te aviso.'),
  ], { left: '· Working', right: '0:41' });

  chat('grok-chat-waiting-long', [
    you('Busca si hay vuelos más baratos a Quito el jueves'),
    action('No reply yet · see Grok Bot app'),
  ], { left: '· Working', right: '16m' });

  const fullReply = 'Encontré tres opciones para el jueves. La más barata es Avianca a las 07:10 por $62, con una escala corta en Quito que no afecta tu llegada. LATAM sale 09:40 directo por $71 y aterriza a las 10:35, que te deja margen para la reunión de las 11. Equair tiene uno a las 18:00 por $58, pero llegas tarde para el plan de la tarde. Tu vuelo actual cuesta $89, así que cambiar a Avianca ahorra $27 y a LATAM $18. Ninguna de las tres cobra el cambio si lo haces antes del martes. Si quieres, reservo Avianca con tu tarjeta guardada y te mando la confirmación aquí.';
  chat('grok-chat-reply', [
    you('Busca si hay vuelos más baratos a Quito el jueves'),
    bot('Hay uno a $62 el jueves 07:10 en Avianca; el tuyo cuesta $89.'),
  ], { left: '· Glasses', right: 'more' });

  // Full reply: whole lines, a page per scroll, the footer counts pages.
  const pages = (name, text, page) => {
    const image = band();
    painter.paintFrame(image);
    const perPage = Math.floor((painter.CONTENT_BOTTOM - painter.CONTENT_TOP) / painter.PITCH);
    const lines = painter.wrapLines(face, text, painter.RIGHT - painter.LEFT);
    const count = Math.ceil(lines.length / perPage);
    assert.ok(page < count, 'page out of range');
    lines.slice(page * perPage, (page + 1) * perPage).forEach((line, i) => face.drawText(image, painter.LEFT, painter.CONTENT_TOP + i * painter.PITCH, line, 255));
    painter.paintFooter(image, face, '· Glasses', `${page + 1}/${count}`);
    save(image, name);
  };
  pages('grok-reply-page-1', fullReply, 0);
  pages('grok-reply-page-2', fullReply, 1);

  chat('grok-chat-needs-you', [
    you('Reserva el de Avianca con mi tarjeta'),
    action('Needs you in Grok Bot app · approve booking'),
  ], { left: '· Glasses', right: 'Needs you' });

  chat('grok-chat-cancelled', [
    you('Busca si hay vuelos más baratos a Quito el jueves'),
    action('Stopped · Glasses'),
  ], { left: '· Glasses', right: '' });

  chat('grok-chat-proactive', [
    action('Routine · Morning brief · 07:00'),
    bot('3 urgentes: Fly pide respuesta hoy; dos PRs esperan review.'),
  ], { left: '· Inbox', right: '' });

  chat('grok-chat-quick', [
    you('Timer de 10 minutos para el café'),
    action('Timer · 10 min'),
    bot('Listo, te aviso a las 09:51.'),
  ], { left: '· Quick', right: 'on phone' });

  chat('grok-chat-send-failed', [
    you('Busca si hay vuelos más baratos a Quito el jueves'),
    action('Not sent · Glasses is busy'),
  ], { left: '· Glasses', right: 'Failed' });

  chat('grok-chat-offline', [
    you('¿A qué hora sale mi vuelo del martes?'),
    bot('Sale 06:20 desde GYE; el check-in ya está abierto.'),
    action("Can't reach Grok Bot · retrying"),
  ], { left: '· Glasses', right: 'Offline' });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
