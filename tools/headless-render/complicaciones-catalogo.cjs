// Candidate complications for the andén column: each one alone as a strip
// (out/cat-<id>-lens.png, 212 px wide) and a few full homes that combine them
// (out/cat-home-<name>(-lens).png). Run from this folder:
//   node complicaciones-catalogo.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { scenes, COLUMN_ICONS, CARD_ICONS } = require('./home-column.cjs');

const context = createRenderContext();
const { graphics, adapter, load } = context;
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const { ICON_SVGS, renderIcon } = load('app/graphics/icons.ts');
const outDir = path.join(__dirname, 'out');

// Lucide icons the app does not ship yet.
const EXTRA_ICONS = {
  smartphone: '<svg viewBox="0 0 24 24" fill="none"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>',
  watch: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6"/><polyline points="12 10 12 12 13 13"/><path d="m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05"/><path d="m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05"/></svg>',
  sunset: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>',
  'alarm-clock': '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/></svg>',
  umbrella: '<svg viewBox="0 0 24 24" fill="none"><path d="M22 12a10.06 10.06 1 0 0-20 0Z"/><path d="M12 12v8a2 2 0 0 0 4 0"/><path d="M12 2v1"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
  'git-pull-request': '<svg viewBox="0 0 24 24" fill="none"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/></svg>',
  'calendar-check': '<svg viewBox="0 0 24 24" fill="none"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>',
  'thermometer': '<svg viewBox="0 0 24 24" fill="none"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>',
};
Object.assign(ICON_SVGS, EXTRA_ICONS);

const WHITE = 255, DIM = 153, FAINT = 85;
const COLUMN_W = 212, ICON = 20, ICON_GAP = 5, TOP_ROW = 12, BOTTOM_ROW = 248, CENTER_X = 106;

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

function tablero(image, hh, mm, centerY, bar) {
  const dot = 6, step = 8, w = 4 * step + dot, h = 6 * step + dot;
  const pitch = w + 8, colonW = 6, colonGap = 10, barGap = 14;
  const blockW = 2 * pitch - 8 + colonGap + colonW + colonGap + 2 * pitch - 8;
  const blockH = h + barGap + 2;
  const left = CENTER_X - Math.round(blockW / 2), top = centerY - Math.round(blockH / 2);
  const digit = (d, x) => DOTS_5x7[Number(d)].forEach((row, dy) => Array.from(row).forEach((on, dx) => {
    if (on === '1') image.fillRoundedRect(x + dx * step, top + dy * step, dot, dot, WHITE, 3);
  }));
  Array.from(hh).forEach((d, i) => digit(d, left + i * pitch));
  let x = left + 2 * pitch - 8 + colonGap;
  image.fillRoundedRect(x, top + 2 * step, colonW, colonW, DIM, 3);
  image.fillRoundedRect(x, top + 4 * step, colonW, colonW, DIM, 3);
  x += colonW + colonGap;
  Array.from(mm).forEach((d, i) => digit(d, x + i * pitch));
  image.fillRect(left, top + h + barGap, blockW, 2, 17);
  image.fillRect(left, top + h + barGap, Math.round(blockW * bar), 2, FAINT);
  return { left, top, w: blockW, h: blockH };
}

function gauge(level) {
  const filled = renderIcon('battery', ICON).clone();
  const inner = Math.round(9 * level / 100);
  if (inner) filled.fillRect(4, 8, inner, 5, WHITE);
  return filled;
}

function kit(image, face) {
  const iconDy = Math.round((face.lineHeight - ICON) / 2);
  const fit = (s, width) => {
    if (face.measureLine(s) <= width) return s;
    while (s.length > 1 && face.measureLine(`${s}…`) > width) s = s.slice(0, -1).trimEnd();
    return `${s}…`;
  };
  /** A complication: icon, then text parts [string, value]; `battery` adds a gauge after the icon. */
  const chip = (x, y, c, align = 'left', maxW = COLUMN_W) => {
    const parts = c.parts.map(([s, v]) => [s, v ?? WHITE]);
    const gap = 6;
    let width = (c.icon ? ICON + ICON_GAP : 0) + (c.battery !== undefined ? ICON + 3 : 0);
    parts.forEach(([s], i) => { width += face.measureLine(s) + (i ? gap : 0); });
    let cx = align === 'left' ? x : x - Math.min(width, maxW);
    if (c.icon) { image.drawImage(renderIcon(c.icon, ICON), cx, y + iconDy); cx += ICON + (c.battery !== undefined ? 3 : ICON_GAP); }
    if (c.battery !== undefined) { image.drawImage(gauge(c.battery), cx, y + iconDy); cx += ICON + ICON_GAP; }
    parts.forEach(([s, v], i) => {
      if (i) cx += gap;
      const text = i === parts.length - 1 ? fit(s, x + maxW - cx) : s;
      face.drawText(image, cx, y, text, v);
      cx += face.measureLine(text);
    });
    return width;
  };
  return { chip };
}

// The catalogue. `src` says where the data comes from; `ya` = the app already has it.
const CATALOG = [
  { group: 'Clima', id: 'lluvia', name: 'Lluvia que viene', c: { icon: 'umbrella', parts: [['60%'], ['15:00', DIM]] }, src: 'Open-Meteo, añadir hourly=precipitation_probability a la misma llamada del clima', ya: false, why: 'Solo aparece si va a llover en las próximas horas; si no, se esconde.' },
  { group: 'Clima', id: 'maxmin', name: 'Máxima y mínima', c: { icon: 'cloud-sun', parts: [['27°'], ['31 / 22', DIM]] }, src: 'Open-Meteo daily=temperature_2m_max,min', ya: false, why: 'Para saber si salir con chaqueta sin abrir Weather.' },
  { group: 'Clima', id: 'atardecer', name: 'Atardecer', c: { icon: 'sunset', parts: [['18:12']] }, src: 'Open-Meteo daily=sunset (o cálculo local)', ya: false, why: 'Tranquila, cambia una vez al día.' },
  { group: 'Agenda', id: 'cuenta', name: 'Cuenta atrás a la reunión', c: { icon: 'calendar', parts: [['in 49m'], ['Daily', DIM]] }, src: 'Calendario (ya)', ya: true, why: 'Alternativa a la hora fija en la línea de andén.' },
  { group: 'Agenda', id: 'libre', name: 'Libre hasta', c: { icon: 'calendar-check', parts: [['Free'], ['till 14:00', DIM]] }, src: 'Calendario (ya): hueco hasta el siguiente evento', ya: true, why: 'Cuando no hay nada próximo, dice cuánto tiempo tienes.' },
  { group: 'Agenda', id: 'alarma', name: 'Alarma de mañana', c: { icon: 'alarm-clock', parts: [['7:00'], ['Sun', DIM]] }, src: 'AlarmManager.nextAlarmClock (FaceclawAlarms.kt ya lo lee)', ya: true, why: 'De noche reemplaza a la reunión: a qué hora suena.' },
  { group: 'Agenda', id: 'timer', name: 'Timer corriendo', c: { icon: 'timer', parts: [['12m'], ['Pasta', DIM]] }, src: 'timerEngine (ya)', ya: true, why: 'En minutos, para no redibujar cada segundo; el último minuto sí cuenta segundos.' },
  { group: 'Trabajo', id: 'paseo', name: 'Paseo con trabajando', c: { icon: 'square-terminal', parts: [['2'], ['· 1 working', DIM]] }, src: 'Paseo (ya)', ya: true, why: 'Saber si hay agentes trabajando aunque nadie te necesite.' },
  { group: 'Trabajo', id: 'pr', name: 'Listo para revisar', c: { icon: 'git-pull-request', parts: [['1'], ['ready', DIM]] }, src: 'Paseo bucket "ready" (ya)', ya: true, why: 'Lo que terminó y espera tu visto bueno.' },
  { group: 'Trabajo', id: 'zona', name: 'Segunda zona horaria', c: { icon: 'globe', parts: [['NYC'], ['10:41', DIM]] }, src: 'Cálculo local, ciudad en Settings', ya: false, why: 'Para reuniones con gente en otra zona.' },
  { group: 'Dispositivos', id: 'telefono', name: 'Teléfono', c: { icon: 'smartphone', battery: 54, parts: [] }, src: 'phone-battery (ya, lo usa el System card)', ya: true, why: 'Junto al anillo y los lentes, o solo cuando está bajo.' },
  { group: 'Dispositivos', id: 'reloj', name: 'Reloj', c: { icon: 'watch', battery: 61, parts: [] }, src: 'Wear bridge (ya, lo usa el System card)', ya: true, why: 'Si usas el reloj como control.' },
  { group: 'Dispositivos', id: 'notis', name: 'Notificaciones', c: { icon: 'bell', parts: [['3']] }, src: 'notification-icons (ya)', ya: true, why: 'Un número, sin contenido; el detalle vive en la app.' },
  { group: 'Dispositivos', id: 'musica', name: 'Lo que suena', c: { icon: 'music', parts: [['Ojitos lindos'], ['Bad Bunny', DIM]] }, src: 'media-controller (ya)', ya: true, why: 'Ocupa la línea de andén mientras suena algo.' },
  { group: 'Dispositivos', id: 'traduccion', name: 'Traducción lista', c: { icon: 'languages', parts: [['ES → EN']] }, src: 'Translate (ya)', ya: true, why: 'Confirma el par de idiomas antes de abrirla.' },
];

// Andén homes: top-left, top-right, the line under the clock, bottom-left, bottom-right.
const HOMES = [
  {
    name: 'manana', title: 'Mañana de trabajo · 09:41', hh: '09', mm: '41', bar: 11 / 60, scene: [9, 41],
    tl: { icon: 'calendar', parts: [['Sat 10']] },
    tr: [{ icon: 'circle', battery: 72, parts: [] }, { icon: 'glasses', battery: 88, parts: [] }],
    line: { parts: [['10:30'], ['Daily con el equipo', DIM]] },
    bl: { icon: 'umbrella', parts: [['60%'], ['15:00', DIM]] },
    br: { icon: 'square-terminal', parts: [['2']] },
  },
  {
    name: 'libre', title: 'Tarde sin reuniones · 15:20', hh: '15', mm: '20', bar: 0, scene: [15, 20],
    tl: { icon: 'calendar', parts: [['Sat 10']] },
    tr: [{ icon: 'circle', battery: 64, parts: [] }, { icon: 'glasses', battery: 71, parts: [] }],
    line: { icon: 'calendar-check', parts: [['Free'], ['till 18:00', DIM]] },
    bl: { icon: 'sunset', parts: [['18:12']] },
    br: { icon: 'git-pull-request', parts: [['1']] },
  },
  {
    name: 'musica', title: 'En la calle con música · 17:05', hh: '17', mm: '05', bar: 0, scene: [17, 5],
    tl: { icon: 'cloud-sun', parts: [['27°']] },
    tr: [{ icon: 'smartphone', battery: 54, parts: [] }, { icon: 'glasses', battery: 66, parts: [] }],
    line: { icon: 'music', parts: [['Ojitos lindos'], ['Bad Bunny', DIM]] },
    bl: { icon: 'timer', parts: [['12m']] },
    br: { icon: 'bell', parts: [['3']] },
  },
  {
    name: 'noche', title: 'Noche · 22:07', hh: '22', mm: '07', bar: 0, scene: [22, 7],
    tl: { icon: 'calendar', parts: [['Sat 10']] },
    tr: [{ icon: 'glasses', battery: 14, parts: [] }],
    line: { icon: 'alarm-clock', parts: [['7:00'], ['Sun', DIM]] },
    bl: { icon: 'moon', parts: [['23°']] },
    br: { icon: 'square-terminal', parts: [['2']] },
  },
];

function png(image, file, tint) {
  const rgba = new Uint8Array(image.width * image.height * 4);
  for (let i = 0; i < image.pixels.length; i++) {
    const v = graphics.grayToNibble(image.pixels[i]) * 17;
    rgba.set(tint ? [Math.round(v * 0.45), v, Math.round(v * 0.5), 255] : [v, v, v, 255], i * 4);
  }
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], image.width, image.height, 0)));
}
function inkBox(image, x0, y0, x1, y1) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (image.pixels[y * image.width + x] > 0) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

async function main() {
  const face = await stockFont(graphics);
  await adapter.prepareIcons([...new Set([...COLUMN_ICONS, ...CARD_ICONS, 'timer', 'bell', 'music', 'languages', ...Object.keys(EXTRA_ICONS)])].map((n) => ICON_SVGS[n]));
  fs.mkdirSync(outDir, { recursive: true });

  for (const item of CATALOG) {
    const strip = new graphics.GrayImage(COLUMN_W, 36);
    kit(strip, face).chip(0, 4, item.c);
    const baked = strip.withDrawsBaked();
    const box = inkBox(baked, 0, 0, COLUMN_W, 36);
    assert.ok(box && box.maxX < COLUMN_W, `${item.id} overflows`);
    png(baked, path.join(outDir, `cat-${item.id}-lens.png`), true);
  }

  for (const home of HOMES) {
    const now = new Date(2026, 9, 10, ...home.scene, 31);
    const band = paintHome(0, scenes(now, calendarCardState), face);
    band.fillRect(0, 0, COLUMN_W, 288, 0);
    const k = kit(band, face);
    k.chip(0, TOP_ROW, home.tl, 'left', 110);
    let right = COLUMN_W;
    for (const c of [...home.tr].reverse()) right -= k.chip(right, TOP_ROW, c, 'right') + 10;
    const clock = tablero(band, home.hh, home.mm, 128, home.bar);
    k.chip(clock.left, clock.top + clock.h + 14, home.line, 'left', clock.w);
    k.chip(0, BOTTOM_ROW, home.bl, 'left', 120);
    k.chip(COLUMN_W, BOTTOM_ROW, home.br, 'right');
    const baked = band.withDrawsBaked();
    assert.ok(!inkBox(baked, COLUMN_W, 0, 218, 118), `${home.name} reaches the dots`);
    const out = new graphics.GrayImage(640, 480);
    out.bitBlt(baked, 32, 96);
    png(out, path.join(outDir, `cat-home-${home.name}.png`));
    png(baked, path.join(outDir, `cat-home-${home.name}-lens.png`), true);
    console.log(`cat-home-${home.name}`);
  }
  fs.writeFileSync(path.join(outDir, 'cat-catalog.json'), JSON.stringify({
    catalog: CATALOG.map(({ group, id, name, src, ya, why }) => ({ group, id, name, src, ya, why })),
    homes: HOMES.map(({ name, title }) => ({ name, title })),
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
