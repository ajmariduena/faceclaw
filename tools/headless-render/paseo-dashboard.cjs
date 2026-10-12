// Paseo app entry as a dashboard of status counts instead of the agent list,
// the stock-style notification for "an agent needs you", and the chat with
// whole messages. Run from this folder:
//   node paseo-dashboard.cjs
// Writes out/pdash-<name>.png (640×480 preview) and out/pdash-<name>-lens.png.
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { scenes, COLUMN_ICONS, CARD_ICONS } = require('./home-column.cjs');

const context = createRenderContext();
const { graphics, adapter, load } = context;
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const { ICON_SVGS, renderIcon } = load('app/graphics/icons.ts');
const terminal = load('app/graphics/terminal-painter.ts');
const outDir = path.join(__dirname, 'out');

const WHITE = 255, BRIGHT = 190, DIM = 153, RULE = 119, FAINT = 85, FILL = 34;

const DOTS_5x7 = [
  ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
];
function dotNumber(image, text, x, y, dot, pitch, value) {
  let cx = x;
  for (const ch of String(text)) {
    DOTS_5x7[Number(ch)].forEach((row, dy) => Array.from(row).forEach((on, dx) => {
      if (on === '1') image.fillRect(cx + dx * pitch, y + dy * pitch, dot, dot, value);
    }));
    cx += 5 * pitch + pitch * 2;
  }
}
const dotWidth = (text, pitch) => String(text).length * 7 * pitch - pitch * 2 - (pitch - Math.ceil(pitch * 0.75));

const nowMs = new Date(2026, 10, 11, 9, 41).getTime();
const min = (m) => nowMs - m * 60_000;
const AGENTS = [
  { group: 'review', title: 'Fix reconnect after BLE drop', at: min(1), line: 'Listo: el anillo reconecta solo tras perder BLE. Tests en verde, falta que lo pruebes con las gafas.', needs: true },
  { group: 'review', title: 'Revisar PR #1221 jelou-cli', at: min(4), line: 'Dejé 3 comentarios; el único bloqueante es el timeout del retry.' },
  { group: 'working', title: 'Migrar workflows a Fly', at: min(0), line: 'Corriendo la suite de integración (2 de 5).' },
  { group: 'working', title: 'Home: complicaciones de clima', at: min(2), line: 'Ajustando el ancho del paraguas en la columna.' },
  { group: 'working', title: 'Traducción en tiempo real', at: min(6), line: 'Comparando Soniox y Deepgram en latencia.' },
  { group: 'background', title: 'Build del APK en la mini', at: min(3), line: 'Gradle compilando en segundo plano (4 min).' },
  ...Array.from({ length: 14 }, (_, i) => ({ group: 'done', title: ['Grok Bot API', 'Calendario solo lectura', 'Fuente del firmware', 'Batería del anillo'][i % 4], at: min(30 + i * 20), line: 'Terminado.' })),
];
const GROUPS = [
  { id: 'review', label: 'Review', long: 'Ready to review' },
  { id: 'working', label: 'Working', long: 'Working' },
  { id: 'background', label: 'Background', long: 'Background' },
  { id: 'done', label: 'Done', long: 'Done' },
];
const count = (id) => AGENTS.filter((a) => a.group === id).length;
const age = (at) => { const m = Math.round((nowMs - at) / 60_000); return m < 1 ? 'now' : m < 60 ? `${m} min` : `${Math.round(m / 60)} h`; };

function icon(image, name, x, y, size = 24) {
  const r = renderIcon(name, size);
  if (r) image.drawImage(r, x, y);
}
function fit(face, text, width) {
  if (face.measureLine(text) <= width) return text;
  const chars = Array.from(text);
  while (chars.length && face.measureLine(chars.join('') + '…') > width) chars.pop();
  return chars.join('') + '…';
}
function wrap(face, text, width, max) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (face.measureLine(next) <= width) line = next; else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > max) { lines.length = max; lines[max - 1] = fit(face, lines[max - 1] + '…', width); }
  return lines;
}

// A: one row per status, big count, newest agent dim under the label. Tap opens that status's agents.
function tablero(face, selected) {
  const band = new graphics.GrayImage(576, 288);
  terminal.paintFrame(band);
  const top = 14, rowH = 56;
  GROUPS.forEach((g, i) => {
    const y = top + i * rowH, on = i === selected, n = count(g.id);
    if (on) band.fillRoundedRect(10, y, 556, rowH - 4, FILL, 6);
    const value = n === 0 ? FAINT : on ? WHITE : BRIGHT;
    const w = dotWidth(n, 4);
    dotNumber(band, n, 92 - w, y + 12, 3, 4, value);
    face.drawText(band, 112, y + 2, g.long, on ? WHITE : BRIGHT);
    const newest = AGENTS.filter((a) => a.group === g.id).sort((a, b) => b.at - a.at)[0];
    if (newest) {
      const right = age(newest.at);
      face.drawText(band, 112, y + 27, fit(face, newest.title, 540 - 112 - face.measureLine(right) - 16), DIM);
      face.drawText(band, 548 - face.measureLine(right), y + 27, right, DIM);
    }
    if (g.id === 'review' && AGENTS.some((a) => a.needs)) band.fillRoundedRect(548, y + 8, 8, 8, WHITE, 4);
  });
  terminal.paintFooter(band, face, '· Paseo', 'Mac connected');
  return band;
}

// B: the four counts as a scoreboard, every agent listed below by urgency; the ring scrolls the agents.
function marcador(face, selectedAgent) {
  const band = new graphics.GrayImage(576, 288);
  terminal.paintFrame(band);
  const ordered = GROUPS.flatMap((g) => AGENTS.filter((a) => a.group === g.id).sort((a, b) => b.at - a.at));
  const sel = ordered[selectedAgent];
  const colW = 133;
  GROUPS.forEach((g, i) => {
    const cx = 22 + i * colW + colW / 2, n = count(g.id), on = sel.group === g.id;
    const w = dotWidth(n, 4);
    dotNumber(band, n, Math.round(cx - w / 2), 22, 3, 4, n === 0 ? FAINT : on ? WHITE : DIM);
    const lw = face.measureLine(g.label);
    face.drawText(band, Math.round(cx - lw / 2), 56, g.label, on ? WHITE : DIM);
    if (on) band.fillRect(Math.round(cx - lw / 2), 84, lw, 2, WHITE);
  });
  band.fillRect(14, 92, 548, 1, RULE);
  const rows = 5, first = Math.max(0, Math.min(selectedAgent - 1, ordered.length - rows));
  for (let i = 0; i < rows && first + i < ordered.length; i++) {
    const a = ordered[first + i], y = 100 + i * 27, on = first + i === selectedAgent;
    const right = age(a.at);
    if (on) face.drawText(band, 22, y, '>', WHITE);
    face.drawText(band, 42, y, fit(face, a.title, 500 - face.measureLine(right)), on ? WHITE : a.group === sel.group ? BRIGHT : DIM);
    face.drawText(band, 554 - face.measureLine(right), y, right, DIM);
  }
  terminal.paintFooter(band, face, '· Paseo', 'Mac connected');
  return band;
}

// C: the home's own layout. Counts in the left column, the selected agent as the card, dots for position.
function dashboard(face, selectedAgent) {
  const band = new graphics.GrayImage(576, 288);
  const ordered = GROUPS.filter((g) => g.id !== 'done').flatMap((g) => AGENTS.filter((a) => a.group === g.id).sort((a, b) => b.at - a.at));
  const sel = ordered[selectedAgent];
  const rowH = 62, top = 18;
  GROUPS.forEach((g, i) => {
    const y = top + i * rowH, n = count(g.id), on = sel.group === g.id;
    dotNumber(band, n, 20, y + 4, 3, 4, n === 0 ? FAINT : on ? WHITE : DIM);
    face.drawText(band, 84, y + 6, g.label, on ? WHITE : DIM);
    if (g.id === 'review' && AGENTS.some((a) => a.needs)) band.fillRoundedRect(84 + face.measureLine(g.label) + 8, y + 14, 6, 6, WHITE, 3);
  });
  const panel = new graphics.GrayImage(318, 260);
  panel.drawRoundedRect(0, 0, 318, 260, 255, 6);
  const g = GROUPS.find((x) => x.id === sel.group);
  icon(panel, 'square-terminal', 20, 18);
  face.drawText(panel, 52, 16, sel.needs ? 'Needs input' : g.long, WHITE);
  const right = age(sel.at);
  face.drawText(panel, 298 - face.measureLine(right), 16, right, DIM);
  let y = 62;
  for (const line of wrap(face, sel.title, 278, 2)) { face.drawText(panel, 20, y, line, WHITE); y += 27; }
  y += 10;
  for (const line of wrap(face, sel.line, 278, Math.floor((254 - y) / 27))) { face.drawText(panel, 20, y, line, DIM); y += 27; }
  band.bitBlt(panel.withDrawsBaked(), 230, 14);
  const dotsTop = 144 - ordered.length * 11 / 2;
  ordered.forEach((_, i) => band.fillRect(218, Math.round(dotsTop + i * 11), i === selectedAgent ? 4 : 2, 3, i === selectedAgent ? WHITE : FAINT));
  return band;
}

// Stock notification over the dimmed home: box x 46–539, y 28–178, radius 6; app + time, sender, two lines.
function notification(face) {
  const data = scenes(new Date(nowMs), calendarCardState);
  const band = paintHome(0, data, face).withDrawsBaked().dimmed(0.3).withDrawsBaked();
  band.fillRoundedRect(46, 28, 494, 151, 0, 6);
  band.drawRoundedRect(46, 28, 494, 151, WHITE, 6);
  icon(band, 'square-terminal', 66, 42, 20);
  face.drawText(band, 94, 40, 'Paseo · Needs input', DIM);
  face.drawText(band, 519 - face.measureLine('now'), 40, 'now', DIM);
  face.drawText(band, 66, 74, fit(face, 'Realtime Translation', 454), WHITE);
  wrap(face, '¿Puedo correr el script de latencia con la clave de Soniox? Tarda unos 2 minutos.', 454, 2)
    .forEach((line, i) => face.drawText(band, 66, 108 + i * 27, line, BRIGHT));
  return band;
}

function chatFull(face) {
  const band = new graphics.GrayImage(576, 288);
  terminal.paintChat(band, face, {
    full: true,
    scrollBack: 0,
    lines: [
      { role: 'user', text: 'Prueba la reconexión del anillo' },
      { role: 'assistant', text: 'Listo: el anillo reconecta solo tras perder BLE. Cambié el backoff a 1, 2 y 4 segundos y ahora reintenta también cuando el teléfono sale de doze. Tests en verde; falta que lo pruebes con las gafas puestas.' },
    ],
    footer: { left: 'Fix reconnect after BLE drop', right: 'Done · 1 min' },
    permission: null,
  });
  return band;
}

function png(image, file, tint) {
  const rgba = new Uint8Array(image.width * image.height * 4);
  for (let i = 0; i < image.pixels.length; i++) {
    const v = graphics.grayToNibble(image.pixels[i]) * 17;
    rgba.set(tint ? [Math.round(v * 0.45), v, Math.round(v * 0.5), 255] : [v, v, v, 255], i * 4);
  }
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], image.width, image.height, 0)));
}

async function main() {
  const face = await stockFont(graphics);
  await adapter.prepareIcons([...new Set([...COLUMN_ICONS, ...CARD_ICONS, 'square-terminal'])].map((n) => ICON_SVGS[n]));
  fs.mkdirSync(outDir, { recursive: true });
  const shots = {
    'a-tablero': tablero(face, 0),
    'b-marcador': marcador(face, 0),
    'c-dashboard': dashboard(face, 0),
    'c-dashboard-working': dashboard(face, 2),
    'notificacion': notification(face),
    'chat-completo': chatFull(face),
  };
  for (const [name, band] of Object.entries(shots)) {
    const baked = band.withDrawsBaked();
    png(baked, path.join(outDir, `pdash-${name}-lens.png`), true);
    console.log(name);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
