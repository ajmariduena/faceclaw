// Navigate minimal mock (Fable): node nav-fable-mock.cjs → out/navf-<direction>-<state>.png
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const { graphics, TtfFont, adapter } = createRenderContext();
const hero = TtfFont.load(adapter.fontPath, 56);
const heroUnit = TtfFont.load(adapter.fontPath, 28);
const big = TtfFont.load(adapter.fontPath, 40);
const bigUnit = TtfFont.load(adapter.fontPath, 22);
const line = TtfFont.load(adapter.fontPath, 30);
const lineUnit = TtfFont.load(adapter.fontPath, 20);
const tiny = TtfFont.load(adapter.fontPath, 12);
const W = 576, H = 288;
const BRIGHT = 255, MID = 187, DIM = 119, FAINT = 68, GHOST = 40;

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
  const file = path.join(__dirname, 'out', `navf-${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  written.push(file);
}

function text(image, x, y, s, value = BRIGHT, maxWidth = W) {
  for (const ch of s) assert.ok(ch === ' ' || face.hasGlyph(ch.codePointAt(0)), `missing glyph ${ch} in "${s}"`);
  assert.ok(face.measureLine(s) <= maxWidth, `overflow: ${s}`);
  face.drawText(image, Math.round(x), Math.round(y), s, value);
}
const width = (s) => face.measureLine(s);

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
};
function maneuver(image, kind, x, y, size, value = BRIGHT, opts = {}) {
  paintShapes(image, x, y, size, size, arrowShapes(ARROWS[kind], { value, ...opts }));
}
/** Right-hand traffic: in from the south, counterclockwise past exits 1 (east) and 2 (north), out at exit 3 (west). */
function roundabout(image, x, y, size, value = BRIGHT) {
  const cx = 0.56, cy = 0.44, r = 0.2, half = 0.07;
  const ring = { value: Math.round(value / 3), inside: (u, v) => Math.abs(Math.hypot(u - cx, v - cy) - r) <= half * 0.75 };
  const travelled = { value, inside: (u, v) => {
    const a = Math.atan2(v - cy, u - cx);
    return Math.abs(Math.hypot(u - cx, v - cy) - r) <= half && !(a > -Math.PI && a < -Math.PI + 0.001) && !(a > Math.PI / 2 && a <= Math.PI);
  } };
  const entry = strokeShape([[cx, 0.98], [cx, cy + r]], half, value);
  const stubs = [strokeShape([[cx + r, cy], [cx + r + 0.16, cy]], half * 0.7, Math.round(value / 3)), strokeShape([[cx, cy - r], [cx, cy - r - 0.16]], half * 0.7, Math.round(value / 3))];
  paintShapes(image, x, y, size, size, [ring, ...stubs, travelled, entry, ...arrowShapes([[cx - r, cy], [0.02, cy]], { half, headLen: 0.2, headHalf: 0.18, value })]);
}
function pin(image, x, y, size, value = BRIGHT) {
  const cx = 0.5, cy = 0.36, r = 0.3;
  paintShapes(image, x, y, size, size, [
    { value, inside: (u, v) => Math.hypot(u - cx, v - cy) <= r || inTriangle(u, v, [cx - r * 0.86, cy + r * 0.5], [cx + r * 0.86, cy + r * 0.5], [cx, 0.98]) },
    { value: 0, inside: (u, v) => Math.hypot(u - cx, v - cy) <= r * 0.38 },
  ]);
}
function chevron(image, cx, cy, size, value = BRIGHT) {
  const shape = (s, v) => ({ value: v, inside: (u, w) => inTriangle(u, w, [0.5, 0.5 - 0.42 * s], [0.5 - 0.34 * s, 0.5 + 0.38 * s], [0.5 + 0.34 * s, 0.5 + 0.38 * s]) && !inTriangle(u, w, [0.5 - 0.34 * s, 0.5 + 0.38 * s + 0.001], [0.5 + 0.34 * s, 0.5 + 0.38 * s + 0.001], [0.5, 0.5 + 0.16 * s]) });
  const x = Math.round(cx - size / 2), y = Math.round(cy - size / 2);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = (px + 0.5) / size, v = (py + 0.5) / size;
    if (shape(1.3, 0).inside(u, v)) image.setPixel(x + px, y + py, 0);
  }
  paintShapes(image, x, y, size, size, [shape(1, value)]);
}
/** Dotted ring: the "thinking" glyph for rerouting. */
function spinner(image, x, y, size, value = MID) {
  const dots = 8;
  paintShapes(image, x, y, size, size, Array.from({ length: dots }, (_, i) => {
    const a = -Math.PI / 2 + (i / dots) * Math.PI * 2;
    const px = 0.5 + Math.cos(a) * 0.36, py = 0.5 + Math.sin(a) * 0.36;
    return { value: Math.round(GHOST + ((value - GHOST) * i) / (dots - 1)), inside: (u, v) => Math.hypot(u - px, v - py) < 0.085 };
  }));
}

// ---- Schematic map drawn from the route polyline: no tile, no edge, fades out with distance from the wearer.

/** Stroke a polyline in absolute pixels; brightness falls off with distance from `focus` so the drawing has no border. */
function strokeFaded(image, pts, { half, value, focus, radius, power = 2.6 }) {
  const N = 3;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 = Math.max(0, Math.floor(x0 - half - 1)); y0 = Math.max(0, Math.floor(y0 - half - 1));
  x1 = Math.min(W - 1, Math.ceil(x1 + half + 1)); y1 = Math.min(H - 1, Math.ceil(y1 + half + 1));
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    let acc = 0;
    for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
      const u = px + (sx + 0.5) / N, v = py + (sy + 0.5) / N;
      if (pts.some((p, i) => i > 0 && segDist(u, v, pts[i - 1][0], pts[i - 1][1], p[0], p[1]) <= half)) acc++;
    }
    if (!acc) continue;
    const [rx, ry] = Array.isArray(radius) ? radius : [radius, radius];
    const d = Math.hypot((px + 0.5 - focus[0]) / rx, (py + 0.5 - focus[1]) / ry);
    const fade = Math.max(0, 1 - Math.pow(Math.min(1, d), power));
    const v = Math.round((acc / (N * N)) * value * fade);
    if (v > image.getPixel(px, py)) image.setPixel(px, py, v);
  }
}
function arc(cx, cy, r, a0, a1, steps = 24) {
  return Array.from({ length: steps + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / steps; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
}
function destinationRing(image, cx, cy, r, value = BRIGHT) {
  const s = r * 2 + 4;
  paintShapes(image, Math.round(cx - s / 2), Math.round(cy - s / 2), s, s, [
    { value, inside: (u, v) => Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.38) <= 0.08 },
    { value, inside: (u, v) => Math.hypot(u - 0.5, v - 0.5) <= 0.14 },
  ]);
}
/**
 * Heading-up schematic. `ahead` and `behind` are absolute-pixel polylines starting at the wearer.
 * `cross` draws the street being turned onto through the turn point; `dest` ends the route.
 */
function schematic(image, { at, ahead, behind, cross, streets, dest, radius, half = 2.6, value = 238, chevronSize = 22, faint = false }) {
  const base = faint ? FAINT : value;
  if (streets) {
    const shift = (pts) => pts.map(([x, y]) => [at[0] + x, at[1] + y]);
    for (const s of streets.filter((s) => s.kind !== 'avenue')) strokeFaded(image, shift(s.pts), { half: 1.3, value: 72, focus: at, radius, power: 2.2 });
    for (const s of streets.filter((s) => s.kind === 'avenue')) strokeFaded(image, shift(s.pts), { half: 2, value: 118, focus: at, radius, power: 2.4 });
  }
  if (behind) strokeFaded(image, [at, ...behind], { half: half * 0.8, value: Math.round(base / 3), focus: at, radius });
  if (cross) strokeFaded(image, cross, { half: half * 0.55, value: Math.round(base / 2.2), focus: at, radius, power: 2 });
  if (ahead) strokeFaded(image, [at, ...ahead], { half, value: base, focus: at, radius });
  if (dest) destinationRing(image, dest[0], dest[1], 9, base);
  chevron(image, at[0], at[1], chevronSize, faint ? MID : BRIGHT);
}

/** A number with its unit on the same baseline; returns the total width. */
function numberUnit(image, x, y, value, unit, numFont, unitFont, color = BRIGHT, unitColor = MID) {
  const vw = Math.round(numFont.measureText(value));
  const gap = Math.round(numFont.sizePx * 0.1);
  numFont.drawText(image, Math.round(x), Math.round(y), value, color);
  unitFont.drawText(image, Math.round(x + vw + gap), Math.round(y + numFont.ascent - unitFont.ascent), unit, unitColor);
  return vw + gap + Math.round(unitFont.measureText(unit));
}

// ---- Shared route geometry per state (pixels relative to the wearer; +y is behind, -y is ahead, +x is right).

const ROUTES = {
  cruising: { ahead: [[0, -400]], behind: [[0, 60]] },
  turn: { ahead: [[0, -96], [160, -96]], behind: [[0, 60]], cross: [[-60, -96], [160, -96]] },
  roundabout(scale = 1) {
    const r = 24 * scale, cy = -92 * scale;
    // Enter from below, counterclockwise on screen through east and north, leave west.
    const ring = arc(0, cy, r, Math.PI / 2, -Math.PI, 28);
    return { ahead: [[0, cy + r], ...ring, [-r - 120, cy]], behind: [[0, 60]], cross: [[r, cy], [r + 70, cy], [r + 70, cy]] };
  },
  arrival: { ahead: [[0, -48]], behind: [[0, 70]], dest: [30, -48] },
};
function placed(route, at) {
  const shift = (pts) => pts && pts.map(([x, y]) => [at[0] + x, at[1] + y]);
  return { at, ahead: shift(route.ahead), behind: shift(route.behind), cross: shift(route.cross), dest: route.dest && [at[0] + route.dest[0], at[1] + route.dest[1]] };
}

async function main() {
  face = await stockFont(graphics);

  // ===== A. Esquinas: Even's two bottom corners, nothing else. Turn cluster bottom-left, schematic map bottom-right.
  const esquinas = (prefix, { mapAt, mapR, attribution = false }) => (state, { glyph, dist, unit, lines, route, streets, faintMap, near }) => {
    const image = new graphics.GrayImage(W, H);
    if (route || streets) schematic(image, { ...placed(route ?? {}, mapAt), streets, radius: mapR, faint: faintMap });
    if (attribution) {
      const mark = 'Google Maps';
      tiny.drawText(image, Math.round(W - 8 - tiny.measureText(mark)), H - 16, mark, FAINT);
    }
    const x = 24, gy = 196;
    const inkA = near ? BRIGHT : DIM, inkT = near ? BRIGHT : MID;
    glyph(image, x, gy, 48, inkA);
    let ty = gy;
    if (dist) { numberUnit(image, x + 66, gy - 10, dist, unit, big, bigUnit, inkT, near ? MID : DIM); ty = gy + 40; }
    lines.forEach(([s, v], i) => text(image, x + 66, ty + i * 27, s, v, 300));
    save(image, `${prefix}-${state}`);
  };
  const SCENES = {
    crucero: { glyph: (i, x, y, s, v) => maneuver(i, 'right', x, y, s, v), dist: '2,4', unit: 'km', lines: [['Av. Francisco de Orellana', DIM]], route: ROUTES.cruising, near: false },
    giro: { glyph: (i, x, y, s, v) => maneuver(i, 'right', x, y, s, v), dist: '150', unit: 'm', lines: [['Av. Francisco de Orellana', BRIGHT]], route: ROUTES.turn, near: true },
    rotonda: { glyph: (i, x, y, s, v) => roundabout(i, x, y, s, v), dist: '300', unit: 'm', lines: [['Tercera salida', BRIGHT], ['Av. de las Américas', DIM]], route: ROUTES.roundabout(), near: true },
    recalculando: { glyph: (i, x, y, s) => spinner(i, x + 4, y + 4, s - 8), lines: [['Recalculando', MID]], route: ROUTES.cruising, faintMap: true, near: false },
    llegada: { glyph: (i, x, y, s, v) => pin(i, x + 4, y, s - 8, v), lines: [['Mall del Sol', BRIGHT], ['a tu derecha', MID]], route: ROUTES.arrival, near: true },
  };
  {
    const draw = esquinas('esquinas', { mapAt: [480, 236], mapR: 140 });
    for (const [state, scene] of Object.entries(SCENES)) draw(state, scene);
  }

  // ===== A2. Esquinas con calles: same layout, plus the surrounding street network at low brightness (Google 2D tiles, roads only).
  {
    // Elliptical fade: the streets must dissolve before the lens edge on the right and before the street name on the left.
    const draw = esquinas('esquinas2', { mapAt: [446, 232], mapR: [126, 152], attribution: true });
    const st = (pts) => ({ pts, kind: 'street' });
    const av = (pts) => ({ pts, kind: 'avenue' });
    // Irregular blocks: skewed cross streets, a T-junction on each side of the avenue, one diagonal.
    const turnStreets = {
      pocas: [
        av([[-220, -96], [230, -96]]),
        st([[0, -96], [5, -240]]), st([[0, 60], [-3, 170]]),
        st([[-170, -36], [170, -46]]),
        st([[-84, 150], [-70, -240]]),
        st([[128, -96], [136, -240]]),
      ],
      media: [
        av([[-220, -96], [230, -96]]),
        st([[0, -96], [5, -240]]), st([[0, 60], [-3, 170]]),
        st([[-170, -36], [170, -46]]), st([[-170, 34], [150, 26]]),
        st([[-84, 150], [-70, -240]]),
        st([[66, 150], [72, -96]]), st([[128, -96], [136, -240]]),
        st([[-170, -164], [170, -176]]),
        st([[72, 10], [200, -60]]),
      ],
      mas: [
        av([[-220, -96], [230, -96]]),
        st([[0, -96], [5, -240]]), st([[0, 60], [-3, 170]]),
        st([[-170, -36], [170, -46]]), st([[-170, 34], [150, 26]]), st([[-170, 104], [150, 98]]),
        st([[-84, 150], [-70, -240]]), st([[-156, 150], [-146, -240]]),
        st([[66, 150], [72, -96]]), st([[128, -96], [136, -240]]), st([[190, 150], [196, -96]]),
        st([[-170, -164], [170, -176]]), st([[-170, -128], [-70, -131]]),
        st([[72, 10], [200, -60]]), st([[-70, -200], [-20, -240]]),
        st([[36, -96], [38, -240]]), st([[-70, -70], [0, -72]]), st([[-40, 60], [-36, 150]]), st([[-170, -8], [-70, -12]]),
      ],
    };
    const openStreets = [
      st([[0, -400], [0, 0]]), st([[0, 0], [-3, 170]]),
      st([[-170, -72], [170, -82]]), av([[-200, -152], [200, -140]]), st([[-170, 40], [170, 34]]),
      st([[-86, 150], [-78, -240]]), st([[70, 150], [78, -240]]),
      st([[78, -82], [190, -190]]),
    ];
    const roundaboutStreets = [
      av([[24, -92], [200, -92]]), av([[-24, -92], [-220, -92]]),
      st([[0, -116], [3, -240]]), st([[0, -68], [0, 0]]), st([[0, 0], [-2, 170]]),
      st([[-170, -30], [170, -38]]), st([[-170, -170], [170, -180]]),
      st([[-92, 150], [-86, -240]]), st([[98, 150], [104, -240]]),
    ];
    const arrivalStreets = [
      st([[0, -48], [1, -240]]), st([[0, 0], [-2, 170]]),
      st([[-170, -110], [170, -118]]), st([[-170, 40], [170, 34]]),
      st([[-90, 150], [-84, -240]]), st([[92, 150], [96, -240]]),
      st([[0, -48], [92, -50]]),
    ];
    draw('crucero', { ...SCENES.crucero, streets: openStreets });
    draw('giro', { ...SCENES.giro, streets: turnStreets.media });
    draw('giro-pocas-calles', { ...SCENES.giro, streets: turnStreets.pocas });
    draw('giro-mas-calles', { ...SCENES.giro, streets: turnStreets.mas });
    draw('rotonda', { ...SCENES.rotonda, streets: roundaboutStreets });
    draw('recalculando', { ...SCENES.recalculando, route: null, streets: openStreets });
    draw('llegada', { ...SCENES.llegada, streets: arrivalStreets });
  }

  // ===== B. Línea: one caption at the bottom, no map. Arrow, distance and street on a single baseline.
  {
    const draw = (state, { glyph, dist, unit, street, near, streetInk }) => {
      const image = new graphics.GrayImage(W, H);
      const y = 230, x = 24;
      const inkA = near ? BRIGHT : DIM;
      glyph(image, x, y, 34, inkA);
      let tx = x + 50;
      if (dist) tx += numberUnit(image, tx, y - 2, dist, unit, line, lineUnit, near ? BRIGHT : MID, near ? MID : DIM) + 18;
      text(image, tx, y + 4, street, streetInk ?? (near ? MID : DIM), W - tx - 16);
      save(image, `linea-${state}`);
    };
    draw('crucero', { glyph: (i, x, y, s, v) => maneuver(i, 'right', x, y, s, v), dist: '2,4', unit: 'km', street: 'Av. Francisco de Orellana', near: false });
    draw('giro', { glyph: (i, x, y, s, v) => maneuver(i, 'right', x, y, s, v), dist: '150', unit: 'm', street: 'Av. Francisco de Orellana', near: true });
    draw('rotonda', { glyph: (i, x, y, s, v) => roundabout(i, x, y, s, v), dist: '300', unit: 'm', street: 'Tercera salida, Av. de las Américas', near: true });
    draw('recalculando', { glyph: (i, x, y, s) => spinner(i, x + 3, y + 3, s - 6), street: 'Recalculando', near: false, streetInk: MID });
    draw('llegada', { glyph: (i, x, y, s, v) => pin(i, x + 3, y, s - 6, v), street: 'Mall del Sol, a tu derecha', near: true, streetInk: BRIGHT });
  }

  // ===== C. Ruta: the map is the hero on the left (what he described), the turn cluster sits low on the right.
  {
    const MAP_AT = [150, 226], MAP_R = 175;
    const draw = (state, { glyph, dist, unit, lines, route, faintMap, near, scale = 1 }) => {
      const image = new graphics.GrayImage(W, H);
      if (route) schematic(image, { ...placed(route, MAP_AT), radius: MAP_R, half: 3, chevronSize: 26, faint: faintMap });
      const x = 330, gy = 144;
      const inkA = near ? BRIGHT : DIM, inkT = near ? BRIGHT : MID;
      glyph(image, x, gy, 64, inkA);
      let ty = gy + 76;
      if (dist) numberUnit(image, x + 84, gy - 4, dist, unit, hero, heroUnit, inkT, near ? MID : DIM);
      lines.forEach(([s, v], i) => text(image, x, ty + i * 27, s, v, W - x - 16));
      save(image, `ruta-${state}`);
    };
    draw('crucero', { glyph: (i, x, y, s, v) => maneuver(i, 'right', x, y, s, v), dist: '2,4', unit: 'km', lines: [['Av. Francisco de Orellana', DIM]], route: ROUTES.cruising, near: false });
    draw('giro', { glyph: (i, x, y, s, v) => maneuver(i, 'right', x, y, s, v), dist: '150', unit: 'm', lines: [['Av. Francisco de Orellana', BRIGHT]], route: { ...ROUTES.turn, ahead: [[0, -120], [200, -120]], cross: [[-70, -120], [200, -120]] }, near: true });
    draw('rotonda', { glyph: (i, x, y, s, v) => roundabout(i, x, y, s, v), dist: '300', unit: 'm', lines: [['Tercera salida', BRIGHT], ['Av. de las Américas', DIM]], route: ROUTES.roundabout(1.3), near: true });
    draw('recalculando', { glyph: (i, x, y, s) => spinner(i, x + 6, y + 6, s - 12), lines: [['Recalculando', MID]], route: ROUTES.cruising, faintMap: true, near: false });
    draw('llegada', { glyph: (i, x, y, s, v) => pin(i, x + 6, y, s - 12, v), lines: [['Mall del Sol', BRIGHT], ['a tu derecha', MID]], route: { ...ROUTES.arrival, ahead: [[0, -60]], dest: [36, -60] }, near: true });
  }

  console.log(written.join('\n'));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
