/**
 * Paseo app screens through the production painters (app/apps/paseo) and
 * the extracted stock font: the home card, the list, and the chat plain,
 * dictating and with a permission pending. Writes out/paseo-app-*.png for
 * eyeballing against the approved renders (paseo-simple.cjs scenes 1 and 5,
 * paseo-chat-fable `ruleslatest`) and checks the geometry those fixed.
 *
 *   node --test tools/headless-render/paseo-app.test.cjs
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const context = createRenderContext();
const { graphics, TtfFont, adapter, load } = context;
const painter = load('app/apps/paseo/paseo-painter.ts');
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const { buildGlanceSnapshot } = load('app/apps/paseo/paseo-glance.ts');
const { sectionAgents, sectionCounts, fallbackLine } = load('app/apps/paseo/paseo-model.ts');
const facePromise = stockFont(graphics);
const outDir = path.join(__dirname, 'out');

const NOW = new Date(2026, 9, 9, 8, 40);
const iso = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();
const agent = (id, title, minutesAgo, extra = {}) => ({ id, title, status: 'idle', createdAt: iso(600), updatedAt: iso(minutesAgo), pendingPermissions: [], labels: {}, ...extra });
const PERMISSION = { id: 'p1', kind: 'tool', name: 'Bash', input: { command: 'npm test -- ble-session' } };
const AGENTS = [
  agent('a1', 'Fix reconnect after BLE drop', 1, { status: 'running', provider: 'claude/claude-opus-4-7', pendingPermissions: [PERMISSION] }),
  agent('a2', 'Revisar PR #1221 jelou-cli', 4, { requiresAttention: true, attentionReason: 'finished' }),
  agent('a3', 'Analizar repositorio Hello QA', 9, { requiresAttention: true, attentionReason: 'finished' }),
  agent('a4', 'Plan low-latency calls across Paseo workspaces', 2, { status: 'running', activeTurn: { turnId: 't', startedAt: iso(1) } }),
  agent('a5', 'Faceclaw v3 home', 12, { status: 'running', activeTurn: { turnId: 't', startedAt: iso(12) } }),
  agent('a6', 'Deploy canary 36', 40),
  agent('a7', 'Migrar settings a Infisical', 55),
  agent('a8', 'Subagente oculto', 0, { labels: { 'paseo.parent-agent-id': 'a4' } }),
  agent('a9', 'Archivado', 0, { archivedAt: iso(0) }),
  ...Array.from({ length: 12 }, (_, i) => agent(`d${i}`, `Done ${i + 1}: tarea terminada hace rato`, 90 + i * 15)),
];
const CHAT = [
  { role: 'user', text: 'Arregla la reconexión tras un corte de BLE.' },
  { role: 'assistant', text: 'La causa: se reusaba la conexión muerta.' },
  { role: 'user', text: '¿Y los reintentos?' },
  { role: 'assistant', text: 'Lo arreglé y agregué reintentos de 1 a 30 s.' },
];
const LONG_REPLY = '**Listo.** Revisé `ble-session.ts` y el problema era que la sesión anterior seguía viva mientras se abría la nueva, así que el firmware rechazaba el segundo canal. Ahora cierro la vieja antes de reconectar.\n\n- también agregué un test';

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

function ink(image, x0, y0, x1, y1) {
  let count = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (image.getPixel(x, y) > 8) count++;
  return count;
}

/** Record every text draw with its position and value. */
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

test('home card: two latest updates, dim agent line and white summary, six dots', async () => {
  const face = await facePromise;
  const clockFont = TtfFont.load(adapter.fontPath, 80);
  const clockFace = { lineHeight: clockFont.lineHeight, measureLine: (t) => clockFont.measureText(t), drawText: (...a) => clockFont.drawText(...a) };
  const events = [{ title: 'Daily con el equipo', startMs: new Date(2026, 9, 9, 9, 30).getTime(), endMs: new Date(2026, 9, 9, 10, 0).getTime(), allDay: false }];
  const lines = { a1: '¿Apruebas correr los tests de BLE?', a4: 'Estoy midiendo la latencia entre workspaces.' };
  const paseo = buildGlanceSnapshot({ configured: true, connected: true, status: '' }, AGENTS, (a) => lines[a.id] ?? 'Listo para fusionar a producción.');
  assert.equal(JSON.stringify(paseo.updates.map((u) => u.agentId)), JSON.stringify(['a1', 'a4']));
  const { face: traced, draws } = tracing(face);
  const home = paintHome(1, { now: NOW, calendar: calendarCardState(true, events, NOW.getTime()), music: null, notifications: [], paseo }, traced, clockFace);
  save(home, 'paseo-app-widget');
  assert.ok(draws.some((d) => /^Fix reconnect after BLE drop · 1 min$|^Fix reconnect.*… · 1 min$/.test(d.text) && d.value === 153));
  assert.ok(draws.some((d) => d.text.startsWith('¿Apruebas correr') && d.value === 255));
  for (let i = 0; i < 6; i++) assert.equal(home.getPixel(218, 115 + i * 11), i === 1 ? 255 : 85);
  const empty = paintHome(1, { now: NOW, calendar: calendarCardState(true, [], NOW.getTime()), music: null, notifications: [], paseo: null }, face, clockFace);
  save(empty, 'paseo-app-widget-unpaired');
});

test('list: sidebar sections with counts, ">" on the selection, footer counts; scrolling keeps the selection visible', async () => {
  const face = await facePromise;
  const sections = sectionAgents(AGENTS);
  assert.equal(JSON.stringify(sections.map((s) => s.label)), JSON.stringify(['Needs input', 'Ready to review', 'Working', 'Done']));
  const rows = [];
  for (const section of sections) {
    rows.push({ kind: 'section', label: section.label, count: section.agents.length });
    for (const a of section.agents) rows.push({ kind: 'agent', title: a.title, key: a.id });
  }
  const view = { rows, selected: 1, footerRight: sectionCounts(sections) };
  assert.equal(view.footerRight, '1 needs · 2 ready · 2 working · 14 done');
  const { face: traced, draws } = tracing(face);
  const image = new graphics.GrayImage(576, 288);
  const top = painter.listScrollTop(rows, view.selected, 0);
  assert.equal(top, 0);
  painter.paintList(image, traced, view, top);
  save(image, 'paseo-app-list');
  assert.equal(image.getPixel(4 + 8, 4), 255, 'frame top edge');
  assert.ok(draws.some((d) => d.text === '>' && d.x === 22 && d.y === 14 + 27));
  assert.ok(draws.some((d) => d.text === 'Needs input' && d.value === 120 && d.y === 14));
  assert.ok(draws.some((d) => d.text === '1' && d.x + face.measureLine('1') === 554));
  assert.ok(draws.some((d) => d.text === '· Paseo' && d.y === 244 + 8));
  assert.ok(draws.some((d) => d.text === view.footerRight && d.x + face.measureLine(d.text) === 554));
  for (let x = 14; x < 562; x++) assert.equal(image.getPixel(x, 244), 119, 'footer rule');
  // Scroll down to the last agent: the window moves so it stays visible.
  const last = rows.length - 1;
  const scrolled = painter.listScrollTop(rows, last, top);
  assert.equal(scrolled, rows.length - painter.LIST_CAPACITY);
  const image2 = new graphics.GrayImage(576, 288);
  const trace2 = tracing(face);
  painter.paintList(image2, trace2.face, { ...view, selected: last }, scrolled);
  save(image2, 'paseo-app-list-scrolled');
  assert.ok(trace2.draws.some((d) => d.text.startsWith('Done 12')));
  assert.ok(trace2.draws.every((d) => d.y + 27 <= 244 || d.y >= 244));
  // Unpaired message.
  const image3 = new graphics.GrayImage(576, 288);
  painter.paintList(image3, face, { rows: [], selected: -1, footerRight: '', message: 'Not paired. Tap to pair with the link from "paseo daemon pair".' }, 0);
  save(image3, 'paseo-app-list-unpaired');
});

test('chat: user right / agent left, one rule above the newest, newest bright, dictation and permission variants', async () => {
  const face = await facePromise;
  const base = { lines: CHAT, scrollBack: 0, footer: { left: '· Working', right: '1m' }, permission: null };
  const { face: traced, draws } = tracing(face);
  const image = new graphics.GrayImage(576, 288);
  painter.paintChat(image, traced, base);
  save(image, 'paseo-app-chat');
  const newest = draws.find((d) => d.text.startsWith('Lo arreglé'));
  assert.ok(newest && newest.value === 255 && newest.x === 22);
  const you = draws.find((d) => d.text === '¿Y los reintentos?');
  assert.ok(you && you.value === 153 && you.x + face.measureLine(you.text) === 554);
  // One rule, between the newest block and the one above it, nothing else between blocks.
  const ruleRows = [];
  for (let y = 14; y < 244; y++) if (image.getPixel(100, y) === 119 && image.getPixel(400, y) === 119) ruleRows.push(y);
  assert.equal(ruleRows.length, 1);
  assert.ok(ruleRows[0] > you.y + 27 && ruleRows[0] < newest.y, `rule at ${ruleRows[0]}`);
  assert.ok(draws.some((d) => d.text === '· Working' && d.value === 119));
  assert.ok(draws.some((d) => d.text === '1m' && d.x + face.measureLine('1m') === 554));

  // Long fallback replies take at most two lines, ending in an ellipsis.
  const fallback = fallbackLine(LONG_REPLY);
  const longView = { ...base, lines: [...CHAT, { role: 'assistant', text: fallback + ' ' + LONG_REPLY.slice(0, 120) }], footer: { left: '· Done', right: '' } };
  const trace2 = tracing(face);
  const image2 = new graphics.GrayImage(576, 288);
  painter.paintChat(image2, trace2.face, longView);
  save(image2, 'paseo-app-chat-long');
  const tail = trace2.draws.filter((d) => d.value === 255 && d.x === 22 && d.y < 244);
  assert.ok(tail.length <= 2 && tail.at(-1).text.endsWith('…'));

  // Scrolling back by whole messages.
  assert.equal(painter.chatMaxScrollBack(face, base), CHAT.length - 1);
  const image3 = new graphics.GrayImage(576, 288);
  const trace3 = tracing(face);
  painter.paintChat(image3, trace3.face, { ...base, scrollBack: 2 });
  save(image3, 'paseo-app-chat-scrolled');
  assert.ok(!trace3.draws.some((d) => d.text.startsWith('Lo arreglé')));
  assert.ok(trace3.draws.some((d) => d.text.startsWith('La causa')));

  // Dictating: the live line sits bright on the right, footer counts.
  const dictating = { ...base, lines: [...CHAT, { role: 'user', text: 'Perfecto, haz el merge cuando pase el check', live: true }], footer: { left: '· Listening', right: '0:04' } };
  const trace4 = tracing(face);
  const image4 = new graphics.GrayImage(576, 288);
  painter.paintChat(image4, trace4.face, dictating);
  save(image4, 'paseo-app-chat-dictating');
  const live = trace4.draws.find((d) => d.text.startsWith('Perfecto'));
  assert.ok(live && live.value === 255 && live.x + face.measureLine(live.text) === 554);
  assert.ok(trace4.draws.some((d) => d.text === '· Listening') && trace4.draws.some((d) => d.text === '0:04'));

  // Permission: nested box with the question and the three options, ">" on the selection, no footer.
  const permission = { ...base, lines: CHAT.slice(0, 2), permission: { question: 'Allow Claude to run npm test -- ble-session?', options: ['Allow once', 'Always allow for this session', 'Deny'], selected: 1 } };
  const trace5 = tracing(face);
  const image5 = new graphics.GrayImage(576, 288);
  painter.paintChat(image5, trace5.face, permission);
  save(image5, 'paseo-app-chat-permission');
  const question = trace5.draws.find((d) => d.text.startsWith('Allow Claude'));
  const selected = trace5.draws.find((d) => d.text === 'Always allow for this session');
  const deny = trace5.draws.find((d) => d.text === 'Deny');
  assert.ok(question && question.x === 28 && question.value === 255);
  assert.ok(selected && selected.value === 255 && trace5.draws.some((d) => d.text === '>' && d.y === selected.y && d.x === 28));
  assert.ok(deny && deny.value === 120);
  assert.ok(!trace5.draws.some((d) => d.text === '· Working'));
  assert.equal(image5.getPixel(14 + 8, 288 - 12 - 1), 255, 'box bottom edge');
  assert.ok(ink(image5, 14, question.y - 8, 562, question.y - 7) > 400, 'box top edge');
  assert.ok(trace5.draws.filter((d) => d.y < question.y - 14).every((d) => d.y + 27 <= question.y - 14));

  // Pair screen.
  const image6 = new graphics.GrayImage(576, 288);
  painter.paintPair(image6, face, { title: 'Pair Paseo', steps: ['Run "paseo daemon pair" on the computer', 'Paste the link into the phone app, then tap'], draft: 'https://app.paseo.sh/#offer=…', busy: '', error: '' });
  save(image6, 'paseo-app-pair');
});
