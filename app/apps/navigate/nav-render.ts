/**
 * Navigate's guidance screen (approved design "A2 · Esquinas con calles",
 * research/navigate/minimal-fable.md): no frame, footer or clock. Bottom-left
 * the maneuver, the distance and the street; bottom-right a heading-up map of
 * the nearby streets (Google road tiles) under the route, fading into black so
 * it has no edge. Pure painters over GrayImage, shared with tools/headless-render.
 */
import { GrayImage } from "../../graphics/image";
import { fitLine } from "../../graphics/terminal-painter";
import type { Face } from "../../ui/terminal";
import { TILE_SIZE } from "../../native/google-maps";

export const BRIGHT = 255;
export const MID = 187;
export const DIM = 119;
export const FAINT = 68;
const GHOST = 40;

/** Map focus (the wearer) and the ellipse the streets fade out within. */
export const MAP_FOCUS: readonly [number, number] = [130, 232];
export const MAP_RADIUS: readonly [number, number] = [126, 152];
/** The turn cluster sits right of the map, so the map takes the less intrusive left edge of view. */
const CLUSTER_X = 276;
const GLYPH_Y = 196;
const GLYPH_SIZE = 48;
const TEXT_X = CLUSTER_X + 66;
const TEXT_WIDTH = 576 - 16 - TEXT_X;

export type GuidanceFonts = {
  face: Face;
  /** Distance numerals and their unit, drawn on one baseline. */
  number: NumberFont;
  unit: NumberFont;
  /** The "Google Maps" attribution under the streets. */
  tiny: NumberFont;
};

export type NumberFont = {
  readonly ascent: number;
  readonly sizePx: number;
  measureText(text: string): number;
  drawText(image: GrayImage, x: number, y: number, text: string, value: number): void;
};

export type GuidanceView =
  | { kind: "guiding"; maneuver: string; roundabout: number; meters: number; road: string; near: boolean }
  | { kind: "rerouting" }
  | { kind: "waiting"; label: string }
  | { kind: "arrived"; name: string; side: "left" | "right" | null }
  | { kind: "message"; lines: string[] };

export type StreetMap = {
  zoom: number;
  /** The wearer, in world pixels at `zoom`. */
  center: [number, number];
  /** Map up, degrees clockwise from north. */
  bearingDeg: number;
  tile: (x: number, y: number) => GrayImage | null;
  /** Route in world pixels, split at the wearer: behind is drawn faint. */
  route: { behind: Array<[number, number]>; ahead: Array<[number, number]> } | null;
  destination: [number, number] | null;
  faint: boolean;
  /** Chevron when the map points where the wearer faces or moves; a dot when that is unknown. */
  showChevron: boolean;
  northUp: boolean;
};

export function paintGuidance(image: GrayImage, fonts: GuidanceFonts, view: GuidanceView, map: StreetMap | null, hint: string | null = null): void {
  if (map) paintStreetMap(image, map, fonts.tiny);
  if (hint) wrapWords(fonts.face, hint, TEXT_WIDTH, 3).forEach((line, i) => fonts.face.drawText(image, CLUSTER_X, 14 + i * 27, line, DIM));
  switch (view.kind) {
    case "guiding": {
      const glyphValue = view.near ? BRIGHT : DIM;
      drawManeuver(image, view.maneuver, CLUSTER_X, GLYPH_Y, GLYPH_SIZE, glyphValue);
      const [number, unit] = formatDistance(view.meters);
      numberUnit(image, fonts, TEXT_X, GLYPH_Y - 10, number, unit, view.near ? BRIGHT : MID, view.near ? MID : DIM);
      const exit = isRoundabout(view.maneuver) && view.roundabout > 0 ? roundaboutExit(view.roundabout) : "";
      const lines: Array<[string, number]> = exit
        ? [[exit, view.near ? BRIGHT : MID], [view.road, DIM]]
        : splitRoad(fonts.face, view.road).map((text): [string, number] => [text, view.near ? BRIGHT : DIM]);
      textLines(image, fonts.face, GLYPH_Y + 40, lines.filter(([text]) => text));
      break;
    }
    case "rerouting":
      blit(image, spinner(GLYPH_SIZE - 8), CLUSTER_X + 4, GLYPH_Y + 4);
      textLines(image, fonts.face, GLYPH_Y + 10, [["Recalculando", MID]]);
      break;
    case "waiting":
      blit(image, spinner(GLYPH_SIZE - 8), CLUSTER_X + 4, GLYPH_Y + 4);
      textLines(image, fonts.face, GLYPH_Y + 10, [[view.label, MID]]);
      break;
    case "arrived": {
      blit(image, glyph(`pin:${GLYPH_SIZE - 8}`, () => pinShapes(), GLYPH_SIZE - 8, BRIGHT), CLUSTER_X + 4, GLYPH_Y);
      const side = view.side === "right" ? "a tu derecha" : view.side === "left" ? "a tu izquierda" : "";
      textLines(image, fonts.face, side ? GLYPH_Y : GLYPH_Y + 10, [[view.name, BRIGHT], ...(side ? [[side, MID] as [string, number]] : [])]);
      break;
    }
    case "message":
      textLines(image, fonts.face, GLYPH_Y + 10 - Math.max(0, view.lines.length - 2) * 27, view.lines.map((line, i): [string, number] => [line, i === 0 ? MID : DIM]));
      break;
  }
}

/** A long street name takes a second line rather than losing its end. */
function splitRoad(face: Face, road: string): string[] {
  return wrapWords(face, road, TEXT_WIDTH, 2);
}

/** Greedy word wrap; the last allowed line takes whatever is left (textLines fits it). */
function wrapWords(face: Face, text: string, width: number, maxLines: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines - 1) {
    let line = words[i++]!;
    while (i < words.length && face.measureLine(`${line} ${words[i]}`) <= width) line += ` ${words[i++]}`;
    lines.push(line);
  }
  if (i < words.length) lines.push(fitLine(face, words.slice(i).join(" "), width));
  return lines;
}

function textLines(image: GrayImage, face: Face, top: number, lines: Array<[string, number]>): void {
  lines.forEach(([text, value], i) => face.drawText(image, TEXT_X, top + i * 27, fitLine(face, text, TEXT_WIDTH), value));
}

function numberUnit(image: GrayImage, fonts: GuidanceFonts, x: number, y: number, number: string, unit: string, value: number, unitValue: number): void {
  const width = Math.round(fonts.number.measureText(number));
  const gap = Math.round(fonts.number.sizePx * 0.1);
  fonts.number.drawText(image, x, y, number, value);
  fonts.unit.drawText(image, x + width + gap, Math.round(y + fonts.number.ascent - fonts.unit.ascent), unit, unitValue);
}

/** "150 m", "2,4 km", "12 km", split into numerals and unit. */
export function formatDistance(meters: number): [string, string] {
  const m = Math.max(0, meters);
  if (m < 1000) return [String(m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10), "m"];
  const km = m / 1000;
  return [km < 10 ? km.toFixed(1).replace(".", ",") : String(Math.round(km)), "km"];
}

const ORDINALS = ["Primera", "Segunda", "Tercera", "Cuarta", "Quinta", "Sexta", "Séptima", "Octava"];
export function roundaboutExit(number: number): string {
  return number >= 1 && number <= ORDINALS.length ? `${ORDINALS[number - 1]} salida` : `Salida ${number}`;
}

export function isRoundabout(maneuver: string): boolean {
  return maneuver.startsWith("ROUNDABOUT");
}

// ---------------------------------------------------------------------------
// Street map

function paintStreetMap(image: GrayImage, map: StreetMap, tiny: NumberFont): void {
  const [fx, fy] = MAP_FOCUS;
  const [rx, ry] = MAP_RADIUS;
  const theta = (map.bearingDeg * Math.PI) / 180;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const x0 = Math.max(0, Math.floor(fx - rx)), x1 = Math.min(image.width - 1, Math.ceil(fx + rx));
  const y0 = Math.max(0, Math.floor(fy - ry)), y1 = Math.min(image.height - 1, Math.ceil(fy + ry));
  const scale = map.faint ? 0.75 : 1;
  let lastKey = "", lastTile: GrayImage | null = null;
  for (let py = y0; py <= y1; py++) {
    const dy = py + 0.5 - fy;
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - fx;
      const d = Math.hypot(dx / rx, dy / ry);
      if (d >= 1) continue;
      const wx = map.center[0] + dx * cos - dy * sin;
      const wy = map.center[1] + dx * sin + dy * cos;
      const tx = Math.floor(wx / TILE_SIZE), ty = Math.floor(wy / TILE_SIZE);
      const key = `${tx}/${ty}`;
      if (key !== lastKey) {
        lastKey = key;
        lastTile = map.tile(tx, ty);
      }
      if (!lastTile) continue;
      const ink = lastTile.pixels[(Math.floor(wy) - ty * TILE_SIZE) * TILE_SIZE + (Math.floor(wx) - tx * TILE_SIZE)]!;
      if (ink < 12) continue;
      const v = Math.round(ink * scale * (1 - Math.pow(d, 2.2)));
      if (v > image.getPixel(px, py)) image.setPixel(px, py, v);
    }
  }
  const toScreen = ([wx, wy]: [number, number]): [number, number] => {
    const ex = wx - map.center[0], ey = wy - map.center[1];
    return [fx + ex * cos + ey * sin, fy - ex * sin + ey * cos];
  };
  if (map.route) {
    const base = map.faint ? FAINT : 238;
    strokeFaded(image, [MAP_FOCUS as [number, number], ...map.route.behind.map(toScreen)], 2.1, Math.round(base / 3));
    strokeFaded(image, [MAP_FOCUS as [number, number], ...map.route.ahead.map(toScreen)], 2.6, base);
  }
  if (map.destination) {
    const [dx, dy] = toScreen(map.destination);
    if (Math.hypot((dx - fx) / rx, (dy - fy) / ry) < 0.9) blit(image, glyph("ring:22", () => ringShapes(), 22, BRIGHT), Math.round(dx - 11), Math.round(dy - 11));
  }
  if (map.showChevron) drawChevron(image, fx, fy, 22, map.faint ? MID : BRIGHT);
  else drawDot(image, fx, fy, 14, map.faint ? MID : BRIGHT);
  if (map.northUp) tiny.drawText(image, Math.round(fx - tiny.measureText("N") / 2), fy - ry + 6, "N", MID);
  const mark = "Google Maps";
  tiny.drawText(image, 8, image.height - 16, mark, FAINT);
}

/** Anti-aliased polyline whose brightness falls off across the map ellipse. */
function strokeFaded(image: GrayImage, points: Array<[number, number]>, half: number, value: number): void {
  const [fx, fy] = MAP_FOCUS;
  const [rx, ry] = MAP_RADIUS;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!, [bx, by] = points[i]!;
    if (Math.min(ax, bx) > fx + rx || Math.max(ax, bx) < fx - rx || Math.min(ay, by) > fy + ry || Math.max(ay, by) < fy - ry) continue;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - half - 1)), maxX = Math.min(image.width - 1, Math.ceil(Math.max(ax, bx) + half + 1));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - half - 1)), maxY = Math.min(image.height - 1, Math.ceil(Math.max(ay, by) + half + 1));
    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const cover = Math.min(1, Math.max(0, half + 0.5 - segmentDistance(px + 0.5, py + 0.5, ax, ay, bx, by)));
        if (!cover) continue;
        const d = Math.hypot((px + 0.5 - fx) / rx, (py + 0.5 - fy) / ry);
        if (d >= 1) continue;
        const v = Math.round(value * cover * (1 - Math.pow(d, 2.6)));
        if (v > image.getPixel(px, py)) image.setPixel(px, py, v);
      }
    }
  }
}

function drawChevron(image: GrayImage, cx: number, cy: number, size: number, value: number): void {
  const halo = glyph(`chevron-halo:${size}`, () => [chevronShape(1.3, BRIGHT)], size, BRIGHT);
  const x = Math.round(cx - size / 2), y = Math.round(cy - size / 2);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    if (halo.pixels[py * size + px]! > 127) image.setPixel(x + px, y + py, 0);
  }
  blit(image, glyph(`chevron:${size}:${value}`, () => [chevronShape(1, value)], size, value), x, y);
}

function drawDot(image: GrayImage, cx: number, cy: number, size: number, value: number): void {
  const circle = (r: number, v: number): Shape => ({ value: v, inside: (u, w) => Math.hypot(u - 0.5, w - 0.5) <= r });
  const x = Math.round(cx - size / 2), y = Math.round(cy - size / 2);
  const halo = glyph(`dot-halo:${size}`, () => [circle(0.5, BRIGHT)], size, BRIGHT);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    if (halo.pixels[py * size + px]! > 127) image.setPixel(x + px, y + py, 0);
  }
  blit(image, glyph(`dot:${size}:${value}`, () => [circle(0.32, value)], size, value), x, y);
}

// ---------------------------------------------------------------------------
// Glyphs: supersampled vector shapes in a unit box, cached per size and value.

type Shape = { value: number; inside: (u: number, v: number) => boolean };
const glyphCache = new Map<string, GrayImage>();

function glyph(key: string, shapes: () => Shape[], size: number, value: number): GrayImage {
  const cacheKey = `${key}:${size}:${value}`;
  const cached = glyphCache.get(cacheKey);
  if (cached) return cached;
  const image = new GrayImage(size, size);
  const list = shapes().map((shape) => ({ ...shape, value: Math.round((shape.value * value) / BRIGHT) }));
  const N = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let acc = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const u = (px + (sx + 0.5) / N) / size, v = (py + (sy + 0.5) / N) / size;
          let ink = 0;
          for (const shape of list) if (shape.inside(u, v)) ink = shape.value;
          acc += ink;
        }
      }
      image.pixels[py * size + px] = Math.round(acc / (N * N));
    }
  }
  glyphCache.set(cacheKey, image);
  return image;
}

function blit(image: GrayImage, source: GrayImage, x: number, y: number): void {
  for (let py = 0; py < source.height; py++) {
    for (let px = 0; px < source.width; px++) {
      const v = source.pixels[py * source.width + px]!;
      if (v && v > image.getPixel(x + px, y + py)) image.setPixel(x + px, y + py, v);
    }
  }
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function inTriangle(px: number, py: number, a: readonly number[], b: readonly number[], c: readonly number[]): boolean {
  const s = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = s(px, py, a[0]!, a[1]!, b[0]!, b[1]!), d2 = s(px, py, b[0]!, b[1]!, c[0]!, c[1]!), d3 = s(px, py, c[0]!, c[1]!, a[0]!, a[1]!);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function stroke(points: Array<[number, number]>, half: number, value = BRIGHT): Shape {
  return { value, inside: (u, v) => points.some((p, i) => i > 0 && segmentDistance(u, v, points[i - 1]![0], points[i - 1]![1], p[0], p[1]) <= half) };
}

/** A thick polyline whose last point is the tip of a filled arrowhead. */
function arrow(points: Array<[number, number]>, { half = 0.085, headLen = 0.26, headHalf = 0.23, value = BRIGHT } = {}): Shape[] {
  const tip = points[points.length - 1]!, prev = points[points.length - 2]!;
  const len = Math.hypot(tip[0] - prev[0], tip[1] - prev[1]);
  const dx = (tip[0] - prev[0]) / len, dy = (tip[1] - prev[1]) / len;
  const base: [number, number] = [tip[0] - dx * headLen, tip[1] - dy * headLen];
  const shaft: Array<[number, number]> = [...points.slice(0, -1), [base[0] + dx * 0.02, base[1] + dy * 0.02]];
  const head = [tip, [base[0] - dy * headHalf, base[1] + dx * headHalf], [base[0] + dy * headHalf, base[1] - dx * headHalf]] as const;
  return [stroke(shaft, half, value), { value, inside: (u, v) => inTriangle(u, v, head[0], head[1], head[2]) }];
}

const ARROWS: Record<string, Array<[number, number]>> = {
  straight: [[0.5, 0.96], [0.5, 0.04]],
  right: [[0.34, 0.96], [0.34, 0.46], [0.94, 0.46]],
  left: [[0.66, 0.96], [0.66, 0.46], [0.06, 0.46]],
  slightRight: [[0.4, 0.96], [0.4, 0.62], [0.78, 0.1]],
  slightLeft: [[0.6, 0.96], [0.6, 0.62], [0.22, 0.1]],
  sharpRight: [[0.3, 0.96], [0.3, 0.3], [0.86, 0.86]],
  sharpLeft: [[0.7, 0.96], [0.7, 0.3], [0.14, 0.86]],
  uturnLeft: [[0.68, 0.96], [0.68, 0.38], [0.6, 0.22], [0.46, 0.16], [0.32, 0.22], [0.26, 0.38], [0.26, 0.9]],
  uturnRight: [[0.32, 0.96], [0.32, 0.38], [0.4, 0.22], [0.54, 0.16], [0.68, 0.22], [0.74, 0.38], [0.74, 0.9]],
};

/** Google's Maneuver constant name → our arrow, roundabout or destination glyph. */
export function drawManeuver(image: GrayImage, maneuver: string, x: number, y: number, size: number, value: number): void {
  if (maneuver.startsWith("DESTINATION")) {
    blit(image, glyph("pin", () => pinShapes(), size - 8, value), x + 4, y);
    return;
  }
  if (isRoundabout(maneuver)) {
    blit(image, glyph(`roundabout:${maneuver}`, () => roundaboutShapes(maneuver), size, value), x, y);
    return;
  }
  const kind = arrowKind(maneuver);
  blit(image, glyph(`arrow:${kind}`, () => arrow(ARROWS[kind]!), size, value), x, y);
}

export function arrowKind(maneuver: string): string {
  if (maneuver.includes("U_TURN")) return maneuver.endsWith("_CLOCKWISE") && !maneuver.endsWith("COUNTERCLOCKWISE") ? "uturnRight" : "uturnLeft";
  const side = maneuver.includes("RIGHT") ? "Right" : maneuver.includes("LEFT") ? "Left" : "";
  if (!side) return "straight";
  if (maneuver.includes("SHARP")) return `sharp${side}`;
  if (maneuver.includes("SLIGHT") || maneuver.includes("KEEP") || maneuver.startsWith("FORK") || maneuver.startsWith("MERGE")) return `slight${side}`;
  return side.toLowerCase();
}

/**
 * Entry from the bottom, the travelled part of the ring bright and the rest
 * dim, leaving at the exit's angle. Counterclockwise for right-hand traffic.
 */
function roundaboutShapes(maneuver: string): Shape[] {
  const clockwise = maneuver.endsWith("_CLOCKWISE") && !maneuver.endsWith("COUNTERCLOCKWISE");
  const turn = maneuver.replace(/^ROUNDABOUT_?/, "").replace(/_?(COUNTER)?CLOCKWISE$/, "");
  // Screen angles (y down): east 0, south π/2, west π, north -π/2.
  const counterclockwiseExit: Record<string, number> = {
    SHARP_RIGHT: Math.PI / 4, RIGHT: 0, SLIGHT_RIGHT: -Math.PI / 4, STRAIGHT: -Math.PI / 2, "": -Math.PI / 2,
    EXIT: -Math.PI / 2, SLIGHT_LEFT: (-3 * Math.PI) / 4, LEFT: -Math.PI, SHARP_LEFT: (-5 * Math.PI) / 4, U_TURN: (-3 * Math.PI) / 2 + 0.35,
  };
  let exit = counterclockwiseExit[turn] ?? -Math.PI / 2;
  if (clockwise) exit = Math.PI - exit;
  const cx = 0.5, cy = 0.42, r = 0.2, half = 0.07;
  const entry = Math.PI / 2;
  // Angles travelled from the entry: decreasing when counterclockwise on screen.
  const sweep = clockwise ? normalize(exit - entry) : normalize(entry - exit);
  const travelled: Shape = { value: BRIGHT, inside: (u, v) => {
    if (Math.abs(Math.hypot(u - cx, v - cy) - r) > half) return false;
    const a = Math.atan2(v - cy, u - cx);
    const along = clockwise ? normalize(a - entry) : normalize(entry - a);
    return along <= sweep;
  } };
  const ring: Shape = { value: 85, inside: (u, v) => Math.abs(Math.hypot(u - cx, v - cy) - r) <= half * 0.75 };
  const ex = cx + Math.cos(exit) * r, ey = cy + Math.sin(exit) * r;
  const tip: [number, number] = [cx + Math.cos(exit) * (r + 0.27), cy + Math.sin(exit) * (r + 0.27)];
  return [
    ring,
    travelled,
    stroke([[cx, 0.98], [cx, cy + r]], half),
    ...arrow([[ex, ey], tip], { half, headLen: 0.2, headHalf: 0.18 }),
  ];
}

function normalize(angle: number): number {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
}

function pinShapes(): Shape[] {
  const cx = 0.5, cy = 0.36, r = 0.3;
  return [
    { value: BRIGHT, inside: (u, v) => Math.hypot(u - cx, v - cy) <= r || inTriangle(u, v, [cx - r * 0.86, cy + r * 0.5], [cx + r * 0.86, cy + r * 0.5], [cx, 0.98]) },
    { value: 0, inside: (u, v) => Math.hypot(u - cx, v - cy) <= r * 0.38 },
  ];
}

function ringShapes(): Shape[] {
  return [
    { value: BRIGHT, inside: (u, v) => Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.38) <= 0.08 },
    { value: BRIGHT, inside: (u, v) => Math.hypot(u - 0.5, v - 0.5) <= 0.14 },
  ];
}

function chevronShape(s: number, value: number): Shape {
  return { value, inside: (u, w) =>
    inTriangle(u, w, [0.5, 0.5 - 0.42 * s], [0.5 - 0.34 * s, 0.5 + 0.38 * s], [0.5 + 0.34 * s, 0.5 + 0.38 * s]) &&
    !inTriangle(u, w, [0.5 - 0.34 * s, 0.5 + 0.38 * s + 0.001], [0.5 + 0.34 * s, 0.5 + 0.38 * s + 0.001], [0.5, 0.5 + 0.16 * s]) };
}

function spinner(size: number): GrayImage {
  const dots = 8;
  return glyph("spinner", () => Array.from({ length: dots }, (_, i): Shape => {
    const a = -Math.PI / 2 + (i / dots) * Math.PI * 2;
    const px = 0.5 + Math.cos(a) * 0.36, py = 0.5 + Math.sin(a) * 0.36;
    return { value: Math.round(GHOST + ((MID - GHOST) * i) / (dots - 1)), inside: (u, v) => Math.hypot(u - px, v - py) < 0.085 };
  }), size, BRIGHT);
}
