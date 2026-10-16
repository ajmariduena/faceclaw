// Instant (fast assistant) screen proposal, in the Live facts style. Run from this folder:
//   node instant.cjs
// Writes out/instant-<screen>-lens.png (the 576×288 lens band).
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const context = createRenderContext();
const { graphics, adapter, load } = context;
const { wrapLines } = load('app/graphics/terminal-painter.ts');
const outDir = path.join(__dirname, 'out');

const W = 576, H = 288, X = 20;
const WHITE = 255, DIM = 153, PREV = 120, FAINT = 85;
const ZAP = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>';
let zap;

function block(img, face, pitch, y, sentences, value) {
  for (const sentence of sentences) {
    for (const line of wrapLines(face, sentence, W - 2 * X)) {
      face.drawText(img, X, y, line, value);
      y += pitch;
    }
  }
  return y;
}

function mark(img, face, label, value = FAINT) {
  img.fillRoundedRect(X, H - 31, 6, 6, value, 3);
  face.drawText(img, X + 14, H - 42, label, value);
}

const SCREENS = {
  // Mic open: the words appear as you say them; nothing else.
  escuchando(img, face, pitch) {
    block(img, face, pitch, 20, ['¿Quién ganó el último Gran Premio de'], WHITE);
    mark(img, face, 'Instant', DIM);
  },
  // ~0.5 s later: your question stays dim on top, the answer in white, one sentence per line.
  respuesta(img, face, pitch) {
    const y = block(img, face, pitch, 20, ['¿Quién ganó el último Gran Premio de Fórmula 1?'], DIM);
    block(img, face, pitch, y + 10, ['Max Verstappen ganó el Gran Premio de Singapur desde la pole.', 'Es su segunda victoria seguida.'], WHITE);
  },
  // Actions answer with what they did.
  accion(img, face, pitch) {
    const y = block(img, face, pitch, 20, ['Pon un timer de cinco minutos.'], DIM);
    block(img, face, pitch, y + 10, ['Listo, timer de 5 minutos.'], WHITE);
  },
  // A follow-up: the previous turn stays above, dimmer; the newest at the bottom.
  seguimiento(img, face, pitch) {
    const lines = (s) => wrapLines(face, s, W - 2 * X).length;
    const q = '¿Y quién va primero en el campeonato?';
    const a = ['Kimi Antonelli lidera, con Verstappen acercándose.'];
    const newest = (lines(q) + a.reduce((n, s) => n + lines(s), 0)) * pitch + 10;
    let y = H - 20 - newest - 18 - pitch * 2;
    y = block(img, face, pitch, y, ['Max Verstappen ganó el Gran Premio de Singapur desde la pole.'], FAINT) + 18;
    y = block(img, face, pitch, y, [q], DIM) + 10;
    block(img, face, pitch, y, a, WHITE);
  },
  // Too big for Instant: it hands the task to Grok Bot and says so.
  'a-grok-bot'(img, face, pitch) {
    const y = block(img, face, pitch, 20, ['Búscame vuelos a Quito para el jueves y resérvame el más barato.'], DIM);
    block(img, face, pitch, y + 10, ['Se lo pasé a Grok Bot; te aviso cuando responda.'], WHITE);
  },
  // Home card next to Grok Bot: a bolt, the last answer, its age.
  tarjeta(img, face, pitch) {
    const x = 150, w = 300, y0 = 6, h = 262;
    img.drawRoundedRect(x, y0, w, h, WHITE, 8);
    img.drawImage(zap, x + w / 2 - 24, y0 + 30);
    const lines = wrapLines(face, 'Max Verstappen ganó el Gran Premio de Singapur.', w - 40);
    lines.forEach((line, i) => face.drawText(img, x + (w - face.measureLine(line)) / 2, y0 + 112 + pitch * i, line, WHITE));
    const age = '2 min';
    face.drawText(img, x + (w - face.measureLine(age)) / 2, y0 + h - 44, age, FAINT);
  },
};

function png(image, file) {
  const rgba = new Uint8Array(image.width * image.height * 4);
  for (let i = 0; i < image.pixels.length; i++) {
    const v = graphics.grayToNibble(image.pixels[i]) * 17;
    rgba.set([Math.round(v * 0.45), v, Math.round(v * 0.5), 255], i * 4);
  }
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], image.width, image.height, 0)));
}

async function main() {
  const face = await stockFont(graphics);
  await adapter.prepareIcons([ZAP]);
  zap = adapter.rasterizeSvg(ZAP, 48, 2, graphics.GrayImage);
  fs.mkdirSync(outDir, { recursive: true });
  const pitch = Math.max(27, face.lineHeight + 4);
  for (const [name, paint] of Object.entries(SCREENS)) {
    const img = new graphics.GrayImage(W, H);
    paint(img, face, pitch);
    png(img.withDrawsBaked(), path.join(outDir, `instant-${name}-lens.png`));
    console.log(name);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
