// Navigate redesign mock (Google Places + Navigation SDK): node nav-google-mock.cjs → out/navg-*.png
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const { graphics, TtfFont, adapter } = createRenderContext();
const hero = TtfFont.load(adapter.fontPath, 56);
const big = TtfFont.load(adapter.fontPath, 40);
const heroUnit = TtfFont.load(adapter.fontPath, 28);
const bigUnit = TtfFont.load(adapter.fontPath, 22);
const W = 576, H = 288;
const FOOT = H - 4 - 40;
const BRIGHT = 255, MID = 187, DIM = 119, FAINT = 68;

const SVG = {
  search: '<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  house: '<svg viewBox="0 0 24 24" fill="none"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/></svg>',
  car: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>',
};

let face;
const written = [];

function save(image, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(image.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  const file = path.join(__dirname, 'out', `navg-${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  written.push(file);
}

function text(image, x, y, s, value = BRIGHT, maxWidth = W) {
  for (const ch of s) assert.ok(ch === ' ' || face.hasGlyph(ch.codePointAt(0)), `missing glyph ${ch} in "${s}"`);
  assert.ok(face.measureLine(s) <= maxWidth, `overflow: ${s}`);
  face.drawText(image, x, y, s, value);
}
const width = (s) => face.measureLine(s);
const textRight = (image, right, y, s, value) => text(image, right - width(s), y, s, value);
const textCenter = (image, cx, y, s, value) => text(image, Math.round(cx - width(s) / 2), y, s, value);

function wrap(s, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of s.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (width(next) <= maxWidth) line = next; else { lines.push(line); line = word; }
  }
  lines.push(line);
  return lines;
}

function icon(image, name, x, y, size, value = BRIGHT) {
  const ink = adapter.rasterizeSvg(SVG[name], size, 2, graphics.GrayImage);
  for (let py = 0; py < ink.height; py++) {
    for (let px = 0; px < ink.width; px++) {
      const v = Math.round(ink.pixels[py * ink.width + px] * value / 255);
      if (v > image.getPixel(x + px, y + py)) image.setPixel(x + px, y + py, v);
    }
  }
}

function frame(left, right) {
  const image = new graphics.GrayImage(W, H);
  image.drawRoundedRect(4, 4, W - 8, H - 8, BRIGHT, 8);
  image.fillRect(14, FOOT, W - 28, 1, DIM);
  if (left) text(image, 22, FOOT + 8, left, DIM);
  if (right) textRight(image, W - 22, FOOT + 8, right, DIM);
  return image;
}

// ---- Supersampled vector shapes (4x4 coverage, max-blended onto black).

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const s = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = s(px, py, ax, ay, bx, by), d2 = s(px, py, bx, by, cx, cy), d3 = s(px, py, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
/** shapes: [{ value, inside(u, v) }] in box units (0..1); later shapes win where they cover. */
function paintShapes(image, x, y, w, h, shapes) {
  const N = 4;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let acc = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const u = (px + (sx + 0.5) / N) / w, v = (py + (sy + 0.5) / N) / h;
          let value = 0;
          for (const shape of shapes) if (shape.inside(u, v)) value = shape.value;
          acc += value;
        }
      }
      const v = Math.round(acc / (N * N));
      if (v > image.getPixel(x + px, y + py)) image.setPixel(x + px, y + py, v);
    }
  }
}
function strokeShape(points, half, value) {
  return { value, inside: (u, v) => points.some((p, i) => i > 0 && segDist(u, v, points[i - 1][0], points[i - 1][1], p[0], p[1]) <= half) };
}
/** A thick rounded polyline whose last point is the tip of a filled arrowhead. */
function arrowShapes(points, { half = 0.085, headLen = 0.26, headHalf = 0.23, value = BRIGHT } = {}) {
  const tip = points[points.length - 1], prev = points[points.length - 2];
  const len = Math.hypot(tip[0] - prev[0], tip[1] - prev[1]);
  const dx = (tip[0] - prev[0]) / len, dy = (tip[1] - prev[1]) / len;
  const base = [tip[0] - dx * headLen, tip[1] - dy * headLen];
  const shaft = [...points.slice(0, -1), [base[0] + dx * 0.02, base[1] + dy * 0.02]];
  const head = [tip, [base[0] - dy * headHalf, base[1] + dx * headHalf], [base[0] + dy * headHalf, base[1] - dx * headHalf]];
  return [strokeShape(shaft, half, value), { value, inside: (u, v) => inTriangle(u, v, ...head) }];
}
const ARROWS = {
  right: [[0.34, 0.96], [0.34, 0.46], [0.94, 0.46]],
  left: [[0.66, 0.96], [0.66, 0.46], [0.06, 0.46]],
  straight: [[0.5, 0.96], [0.5, 0.04]],
  slightLeft: [[0.6, 0.96], [0.6, 0.62], [0.24, 0.12]],
  slightRight: [[0.4, 0.96], [0.4, 0.62], [0.76, 0.12]],
};
function maneuver(image, kind, x, y, size, value = BRIGHT, opts = {}) {
  paintShapes(image, x, y, size, size, arrowShapes(ARROWS[kind], { value, ...opts }));
}
/** Right-hand traffic: in from the south, counterclockwise past exits 1 (east) and 2 (north), out at exit 3 (west). */
function roundabout(image, x, y, size) {
  const cx = 0.56, cy = 0.44, r = 0.2, half = 0.07;
  const ring = { value: 85, inside: (u, v) => Math.abs(Math.hypot(u - cx, v - cy) - r) <= half * 0.75 };
  const travelled = { value: BRIGHT, inside: (u, v) => {
    const a = Math.atan2(v - cy, u - cx);
    return Math.abs(Math.hypot(u - cx, v - cy) - r) <= half && !(a > -Math.PI && a < -Math.PI + 0.001) && !(a > Math.PI / 2 && a <= Math.PI);
  } };
  const entry = strokeShape([[cx, 0.98], [cx, cy + r]], half, BRIGHT);
  const stubs = [strokeShape([[cx + r, cy], [cx + r + 0.16, cy]], half * 0.7, 85), strokeShape([[cx, cy - r], [cx, cy - r - 0.16]], half * 0.7, 85)];
  paintShapes(image, x, y, size, size, [ring, ...stubs, travelled, entry, ...arrowShapes([[cx - r, cy], [0.02, cy]], { half, headLen: 0.2, headHalf: 0.18 })]);
}
function pin(image, x, y, size, value = BRIGHT) {
  const cx = 0.5, cy = 0.36, r = 0.3;
  paintShapes(image, x, y, size, size, [
    { value, inside: (u, v) => Math.hypot(u - cx, v - cy) <= r || inTriangle(u, v, [cx - r * 0.86, cy + r * 0.5], [cx + r * 0.86, cy + r * 0.5], [cx, 0.98]) },
    { value: 0, inside: (u, v) => Math.hypot(u - cx, v - cy) <= r * 0.38 },
  ]);
}
function chevron(image, cx, cy, size) {
  const shape = (s, value) => ({ value, inside: (u, v) => inTriangle(u, v, [0.5, 0.5 - 0.42 * s], [0.5 - 0.34 * s, 0.5 + 0.38 * s], [0.5 + 0.34 * s, 0.5 + 0.38 * s]) && !inTriangle(u, v, [0.5 - 0.34 * s, 0.5 + 0.38 * s + 0.001], [0.5 + 0.34 * s, 0.5 + 0.38 * s + 0.001], [0.5, 0.5 + 0.16 * s]) });
  const x = Math.round(cx - size / 2), y = Math.round(cy - size / 2);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = (px + 0.5) / size, v = (py + 0.5) / size;
    if (shape(1.25, 0).inside(u, v)) image.setPixel(x + px, y + py, 0);
  }
  paintShapes(image, x, y, size, size, [shape(1, BRIGHT)]);
}

// ---- Stand-in for a dark-styled Google Static Maps tile.

function fakeMap(w, h, { route, pinAt, chevronAt, roads }) {
  const map = new graphics.GrayImage(w, h, 0);
  const road = (pts, half, value) => paintShapes(map, 0, 0, w, h, [strokeShape(pts.map(([a, b]) => [a / w, b / h]), half / Math.max(w, h), value)]);
  for (const r of roads) road(r.pts, r.half, r.value);
  if (route) {
    road(route, 3.2, 0);
    road(route, 2.6, 238);
  }
  if (pinAt) pin(map, pinAt[0] - 11, pinAt[1] - 22, 22);
  if (chevronAt) chevron(map, chevronAt[0], chevronAt[1], 22);
  return map;
}
function roundedBlit(image, src, x, y, r) {
  for (let py = 0; py < src.height; py++) for (let px = 0; px < src.width; px++) {
    const dx = Math.max(r - px, px - (src.width - 1 - r), 0), dy = Math.max(r - py, py - (src.height - 1 - r), 0);
    if (dx * dx + dy * dy > r * r) continue;
    image.setPixel(x + px, y + py, src.pixels[py * src.width + px]);
  }
  image.drawRoundedRect(x, y, src.width, src.height, FAINT, r);
}
function grid(w, h) {
  const roads = [];
  for (let i = -20; i < w + 40; i += 52) roads.push({ pts: [[i, -10], [i + 30, h + 10]], half: 1.4, value: 34 });
  for (let j = 12; j < h; j += 44) roads.push({ pts: [[-10, j], [w + 10, j - 14]], half: 1.4, value: 34 });
  roads.push({ pts: [[-10, h * 0.78], [w + 10, h * 0.18]], half: 2.6, value: 51 });
  return roads;
}

// ---- Shared pieces.

/** A number with its unit on the same baseline; returns the total width. */
function numberUnit(image, x, y, value, unit, numFont = hero, unitFont = heroUnit, draw = true) {
  const vw = Math.round(numFont.measureText(value));
  const gap = Math.round(numFont.sizePx * 0.1);
  if (draw) {
    numFont.drawText(image, x, y, value, BRIGHT);
    unitFont.drawText(image, x + vw + gap, y + numFont.ascent - unitFont.ascent, unit, MID);
  }
  return vw + gap + Math.round(unitFont.measureText(unit));
}
const distance = (image, x, y, value, unit) => numberUnit(image, x, y, value, unit);
function approachBar(image, x, y, w, fraction) {
  image.fillRect(x, y, w, 2, FAINT);
  image.fillRect(x, y, Math.round(w * fraction), 2, BRIGHT);
}
function lanes(image, x, y, list) {
  const size = 26, gap = 12;
  list.forEach((lane, i) => {
    const lx = x + i * (size + gap);
    if (i > 0) for (let d = 0; d < size; d += 5) image.fillRect(lx - gap / 2 - 1, y + d, 1, 2, FAINT);
    maneuver(image, lane.kind, lx, y, size, lane.on ? BRIGHT : FAINT, { half: 0.1, headLen: 0.32, headHalf: 0.28 });
  });
  return list.length * (size + gap) - gap;
}
function thenChip(image, x, y, kind, label) {
  const w = 22 + 8 + width(label) + 20;
  image.drawRoundedRect(x, y, w, 30, FAINT, 15);
  maneuver(image, kind, x + 12, y + 5, 20, MID, { half: 0.11, headLen: 0.34, headHalf: 0.3 });
  text(image, x + 40, y + 2, label, MID);
}

async function main() {
  face = await stockFont(graphics);
  await adapter.prepareIcons(Object.values(SVG));

  // 1. Destino
  {
    const image = frame('· Navegar', 'Carro');
    const rows = [
      ['search', 'Buscar un lugar', ''],
      ['house', 'Casa', '6,1 km'],
      ['briefcase', 'Trabajo', '12 km'],
      ['calendar', 'Dentista · 16:00', '3,8 km'],
      ['clock', 'Mall del Sol', '4,3 km'],
    ];
    rows.forEach(([ic, label, right], i) => {
      const y = 16 + i * 44;
      const sel = i === 0;
      if (sel) text(image, 20, y, '>', BRIGHT);
      icon(image, ic, 46, y + 3, 20, sel ? BRIGHT : MID);
      text(image, 84, y, label, sel ? BRIGHT : MID, 360);
      if (right) textRight(image, W - 22, y, right, DIM);
    });
    icon(image, 'mic', W - 42, 19, 20, DIM);
    save(image, 'destino');
  }

  // 2. Escuchando
  {
    const image = frame('· Buscar', 'Google Maps');
    const cx = W / 2, cy = 78;
    paintShapes(image, cx - 60, cy - 60, 120, 120, [
      { value: 34, inside: (u, v) => Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.46) < 0.012 },
      { value: 68, inside: (u, v) => Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.36) < 0.014 },
      { value: 119, inside: (u, v) => Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.26) < 0.016 },
    ]);
    icon(image, 'mic', cx - 14, cy - 14, 28, BRIGHT);
    textCenter(image, cx, 150, 'mall del sol', BRIGHT);
    textCenter(image, cx, 186, 'Di un lugar o una dirección', DIM);
    save(image, 'escuchando');
  }

  // 3. Resultados
  {
    const image = frame('· mall del sol', 'Google Maps');
    const rows = [
      ['Mall del Sol', 'Av. Joaquín Orrantia, Guayaquil', '4,3 km'],
      ['Mall del Sol, parqueadero norte', 'Av. Juan Tanca Marengo', '4,6 km'],
      ['Hotel Sonesta Guayaquil', 'Av. Joaquín Orrantia y Leopoldo', '4,4 km'],
    ];
    rows.forEach(([name, place, km], i) => {
      const y = 14 + i * 76;
      const sel = i === 0;
      if (sel) text(image, 20, y + 13, '>', BRIGHT);
      text(image, 46, y, name, sel ? BRIGHT : MID, 400);
      text(image, 46, y + 27, place, sel ? MID : DIM, 420);
      textRight(image, W - 22, y + 13, km, DIM);
    });
    save(image, 'resultados');
  }

  // 4. Vista previa de la ruta
  {
    const image = frame('· Vista previa', 'Google Maps');
    const mw = 236, mh = FOOT - 20;
    const route = [[40, mh - 14], [64, mh - 70], [128, mh - 92], [150, 90], [196, 40]];
    roundedBlit(image, fakeMap(mw, mh, { roads: grid(mw, mh), route, pinAt: [196, 40] }), 10, 10, 8);
    const x = 10 + mw + 22, right = W - 22;
    text(image, x, 14, 'Mall del Sol', BRIGHT, right - x);
    text(image, x, 41, 'Av. Joaquín Orrantia', DIM, right - x);
    distance(image, x, 74, '14', 'min');
    text(image, x, 140, '4,3 km · llegas 18:46', MID, right - x);
    text(image, x, 167, 'Tráfico fluido', DIM, right - x);
    const modes = ['Carro', 'A pie', 'Moto'];
    let mx = x;
    modes.forEach((m, i) => {
      const w = width(m) + 24;
      if (i === 0) image.drawRoundedRect(mx, 200, w, 32, BRIGHT, 16);
      text(image, mx + 12, 202, m, i === 0 ? BRIGHT : DIM);
      mx += w + 6;
    });
    save(image, 'vista-previa');
  }

  // 5. Guiando, con mapa
  const guidance = (name, { glyph, dist, unit, street, laneList, then, fraction, footLeft, footRight }) => {
    const image = frame(footLeft, footRight);
    const mw = 220, mh = FOOT - 20;
    const route = [[mw / 2, mh + 10], [mw / 2, 96], [mw - 20, 96], [mw - 20, -10]];
    roundedBlit(image, fakeMap(mw, mh, { roads: grid(mw, mh), route, chevronAt: [mw / 2, mh - 46] }), 10, 10, 8);
    const x = 10 + mw + 22, right = W - 22;
    glyph(image, x, 16, 64);
    distance(image, x + 82, 18, dist, unit);
    approachBar(image, x, 94, right - x, fraction);
    const lines = wrap(street, right - x).slice(0, 2);
    lines.forEach((l, i) => text(image, x, 106 + i * 27, l, BRIGHT));
    let y = 106 + lines.length * 27 + 12;
    if (laneList) { lanes(image, x, y, laneList); y += 38; }
    if (then) thenChip(image, x, y, then.kind, then.label);
    save(image, name);
  };
  guidance('guiando', {
    glyph: (img, x, y, s) => maneuver(img, 'right', x, y, s),
    dist: '150', unit: 'm', street: 'Av. Francisco de Orellana',
    laneList: [{ kind: 'straight' }, { kind: 'straight' }, { kind: 'right', on: true }],
    then: { kind: 'left', label: 'luego' }, fraction: 0.62,
    footLeft: '· 12 min · 4,2 km', footRight: 'llegas 18:52',
  });
  guidance('rotonda', {
    glyph: (img, x, y, s) => roundabout(img, x, y, s),
    dist: '300', unit: 'm', street: 'Tercera salida, Av. de las Américas',
    fraction: 0.3, footLeft: '· 9 min · 3,1 km', footRight: 'llegas 18:52',
  });

  // 6. Guiando, solo flecha (sin marco, como las capas en vivo)
  {
    const image = new graphics.GrayImage(W, H);
    const cx = W / 2;
    maneuver(image, 'right', cx - 44, 18, 88);
    const vw = numberUnit(image, 0, 0, '150', 'm', hero, heroUnit, false);
    numberUnit(image, Math.round(cx - vw / 2), 118, '150', 'm');
    textCenter(image, cx, 192, 'Av. Francisco de Orellana', BRIGHT);
    textCenter(image, cx, 226, 'llegas 18:52 · 12 min', DIM);
    save(image, 'solo-flecha');
  }

  // 7. Recalculando
  {
    const image = frame('· 12 min · 4,2 km', 'llegas 18:52');
    const mw = 220, mh = FOOT - 20;
    roundedBlit(image, fakeMap(mw, mh, { roads: grid(mw, mh), chevronAt: [mw / 2, mh - 46] }), 10, 10, 8);
    const x = 10 + mw + 22;
    const dots = 10;
    paintShapes(image, x, 22, 56, 56, Array.from({ length: dots }, (_, i) => {
      const a = -Math.PI / 2 + (i / dots) * Math.PI * 2;
      const px = 0.5 + Math.cos(a) * 0.38, py = 0.5 + Math.sin(a) * 0.38;
      return { value: Math.round(34 + (221 * i) / (dots - 1)), inside: (u, v) => Math.hypot(u - px, v - py) < 0.075 };
    }));
    text(image, x + 74, 36, 'Recalculando', BRIGHT);
    text(image, x, 106, 'Te saliste de la ruta.', MID);
    text(image, x, 133, 'Sigue derecho mientras', DIM);
    text(image, x, 160, 'busco otra.', DIM);
    save(image, 'recalculando');
  }

  // 8. Llegada
  {
    const image = frame('· Navegar', '18:46');
    const cx = W / 2;
    pin(image, cx - 28, 30, 56);
    textCenter(image, cx, 102, 'Llegaste', BRIGHT);
    textCenter(image, cx, 136, 'Mall del Sol está a tu derecha', MID);
    textCenter(image, cx, 170, '14 min · 4,3 km', DIM);
    save(image, 'llegada');
  }

  // 9. Tarjeta del inicio durante el viaje
  {
    const src = UPNG.decode(fs.readFileSync(process.argv[2] || path.join(__dirname, 'out/bots-home.png')));
    const rgba = new Uint8Array(UPNG.toRGBA8(src)[0]);
    const image = new graphics.GrayImage(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) image.setPixel(x, y, rgba[((y + 96) * 640 + x + 32) * 4]);
    const px = 230, py = 14, pw = 318, ph = 260;
    image.fillRect(px + 2, py + 2, pw - 4, ph - 4, 0);
    const cx = px + pw / 2;
    maneuver(image, 'right', cx - 36, py + 22, 72);
    const vw = numberUnit(image, 0, 0, '150', 'm', big, bigUnit, false);
    numberUnit(image, Math.round(cx - vw / 2), py + 108, '150', 'm', big, bigUnit);
    textCenter(image, cx, py + 168, 'Av. Francisco de Orellana', BRIGHT);
    textCenter(image, cx, py + 214, 'llegas 18:52', DIM);
    save(image, 'inicio');
  }

  console.log(written.join('\n'));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
