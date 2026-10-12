// No NativeScript imports: the home card, tests and tools/headless-render load this directly.
import { GrayImage } from "../../graphics/image";

export type BotFace = "idle" | "working" | "unread";

export const BOT_MARK_WIDTH = 120;
export const BOT_MARK_HEIGHT = 95;

// Traced from the "Glasses" bot's character in the Grok Bot app, in units of
// that screenshot: a pill tilted up to the right with two slanted eye slits.
const SCALE = BOT_MARK_WIDTH / 240;
const HALF = 32;
const RADIUS = 58.5;
const TILT = 15 * Math.PI / 180;
const EYE_HOLE = 8;
const EYES = [[-8, -40, 9, -2], [44, -52, 61, -15]] as const;
/** Per face: the eyes' shift (x, y) and how much longer each end gets. */
const FACES: Record<BotFace, readonly [number, number, number]> = {
  idle: [0, 0, 0],
  working: [12, -6, -8],
  unread: [0, -2, 7],
};
const SAMPLES = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] as const;

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function eyes(face: BotFace): number[][] {
  const [sx, sy, grow] = FACES[face];
  return EYES.map(([ax, ay, bx, by]) => {
    const mx = (ax + bx) / 2 + sx, my = (ay + by) / 2 + sy;
    const half = Math.hypot(bx - ax, by - ay) / 2;
    const k = (half + grow) / half;
    return [mx - (bx - ax) / 2 * k, my - (by - ay) / 2 * k, mx + (bx - ax) / 2 * k, my + (by - ay) / 2 * k];
  });
}

const cache = new Map<BotFace, GrayImage>();

/** The bot's mark for a face, white on black, 4× supersampled at the edges. */
export function botMark(face: BotFace): GrayImage {
  const cached = cache.get(face);
  if (cached) return cached;
  const image = new GrayImage(BOT_MARK_WIDTH, BOT_MARK_HEIGHT);
  const slits = eyes(face);
  for (let py = 0; py < BOT_MARK_HEIGHT; py++) {
    for (let px = 0; px < BOT_MARK_WIDTH; px++) {
      let cover = 0;
      for (const [ox, oy] of SAMPLES) {
        const x = (px + ox) / SCALE - 120, y = (py + oy) / SCALE - 95;
        const u = x * Math.cos(TILT) - y * Math.sin(TILT), v = x * Math.sin(TILT) + y * Math.cos(TILT);
        if (segmentDistance(u, v, -HALF, 0, HALF, 0) > RADIUS) continue;
        if (slits.every(([ax, ay, bx, by]) => segmentDistance(x, y, ax, ay, bx, by) > EYE_HOLE)) cover++;
      }
      if (cover) image.pixels[py * BOT_MARK_WIDTH + px] = Math.round(255 * cover / SAMPLES.length);
    }
  }
  cache.set(face, image);
  return image;
}
