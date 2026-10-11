// Live facts (Converse) screen alternatives, with facts from the latency probe.
// Reference: Even Conversate's AI Cue card. Run from this folder:
//   node live-facts.cjs
// Writes out/facts-<variant>-lens.png (the 576×288 lens band).
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const context = createRenderContext();
const { graphics, adapter, load } = context;
const { ICON_SVGS, renderIcon } = load('app/graphics/icons.ts');
const { wrapLines } = load('app/graphics/terminal-painter.ts');
const outDir = path.join(__dirname, 'out');

const W = 576, H = 288;
const WHITE = 255, BODY = 190, DIM = 153, FAINT = 85;
const facts = [
  { topic: 'Chimborazo', source: 'Wikipedia', text: 'El Chimborazo mide 6.263 m sobre el nivel del mar.' },
  { topic: 'Guayaquil', source: 'INEC', text: 'Guayaquil tiene alrededor de 3 millones de habitantes.' },
  { topic: 'Cerebras CS-4', source: 'cerebras.ai', text: 'Cerebras lanzó el CS-4 el 18 de agosto de 2026, su nuevo acelerador de IA.' },
];
const [now, prev, older] = facts;
// The Cuenca conversation from the context test, newest first.
const history = [
  { topic: 'Parque Nacional Cajas', source: 'es.wikipedia.org', text: 'No es Patrimonio de la Humanidad de la UNESCO; es reserva de biosfera.' },
  { topic: 'Cajas', source: 'viajacongus.com', text: 'El Parque Nacional Cajas está a media hora en coche de Cuenca.' },
  { topic: 'Catedral de Cuenca', source: 'ec.viajandox.com', text: 'La Catedral Nueva de Cuenca se terminó en 1975.' },
];
const PREV = 120, PREV_HEADER = 70, OLDER = 70;
function factBlock(img, face, pitch, fact, y, header, body) {
  face.drawText(img, 20, y, `${fact.topic} · ${fact.source}`, header);
  const lines = wrapLines(face, fact.text, W - 40);
  lines.forEach((line, i) => face.drawText(img, 20, y + pitch * (i + 1) + 4, line, body));
  return y + pitch * (lines.length + 1) + 4;
}

const VARIANTS = {
  // Even's AI Cue: rounded box, icon + topic + source, the fact underneath.
  tarjeta(img, face, pitch) {
    const x = 14, y = 14, w = W - 28, pad = 18;
    const lines = wrapLines(face, now.text, w - 2 * pad);
    const h = 2 * 12 + pitch * (1 + lines.length) + 6;
    img.drawRoundedRect(x, y, w, h, WHITE, 6);
    const icon = renderIcon('sparkles', 20);
    if (icon) img.drawImage(icon, x + pad, y + 14);
    face.drawText(img, x + pad + 28, y + 12, now.topic, DIM);
    face.drawText(img, x + w - pad - face.measureLine(now.source), y + 12, now.source, FAINT);
    lines.forEach((line, i) => face.drawText(img, x + pad, y + 12 + pitch * (i + 1) + 6, line, WHITE));
  },
  // No box: topic dim, the fact in white. Nothing else on screen.
  texto(img, face, pitch) {
    face.drawText(img, 20, 20, `${now.topic} · ${now.source}`, DIM);
    wrapLines(face, now.text, W - 40).forEach((line, i) => face.drawText(img, 20, 20 + pitch * (i + 1) + 4, line, WHITE));
  },
  // The newest fact on top in white, the two before it dim under it.
  pila(img, face, pitch) {
    let y = 20;
    [now, prev, older].forEach((fact, k) => {
      const lines = wrapLines(face, fact.text, W - 40);
      lines.forEach((line, i) => face.drawText(img, 20, y + pitch * i, line, k === 0 ? WHITE : k === 1 ? DIM : FAINT));
      y += pitch * lines.length + 16;
    });
  },
  // Caption-style: only the fact, low in the lens, out of the line of sight.
  abajo(img, face, pitch) {
    const lines = wrapLines(face, now.text, W - 40);
    const top = H - 20 - pitch * lines.length;
    lines.forEach((line, i) => face.drawText(img, 20, top + pitch * i, line, WHITE));
  },
  // History 1: the newest on top, the one before it under it, dimmer.
  'anterior-abajo'(img, face, pitch) {
    const y = factBlock(img, face, pitch, history[0], 20, DIM, WHITE);
    factBlock(img, face, pitch, history[1], y + 18, PREV_HEADER, PREV);
  },
  // History 2: like a chat, older facts above and dimmer, the newest at the bottom in white.
  'anterior-arriba'(img, face, pitch) {
    const newestLines = wrapLines(face, history[0].text, W - 40).length;
    const newestTop = H - 20 - pitch * (newestLines + 1) - 4;
    const prevLines = wrapLines(face, history[1].text, W - 40).length;
    factBlock(img, face, pitch, history[1], newestTop - 18 - pitch * (prevLines + 1) - 4, PREV_HEADER, PREV);
    factBlock(img, face, pitch, history[0], newestTop, DIM, WHITE);
  },
  // History 3: the newest and the two before it without headers, each step dimmer.
  'dos-anteriores'(img, face, pitch) {
    let y = factBlock(img, face, pitch, history[0], 20, DIM, WHITE) + 14;
    for (const [fact, value] of [[history[1], PREV], [history[2], OLDER]]) {
      const lines = wrapLines(face, fact.text, W - 40);
      lines.forEach((line, i) => face.drawText(img, 20, y + pitch * i, line, value));
      y += pitch * lines.length + 10;
    }
  },
  // History 4: the previous fact without its header, so it takes less room.
  'anterior-compacto'(img, face, pitch) {
    const y = factBlock(img, face, pitch, history[0], 20, DIM, WHITE) + 18;
    wrapLines(face, history[1].text, W - 40).forEach((line, i) => face.drawText(img, 20, y + pitch * i, line, PREV));
  },
  // Waiting: nothing but a faint mark that it is listening.
  espera(img, face) {
    img.fillRoundedRect(20, H - 31, 6, 6, FAINT, 3);
    face.drawText(img, 34, H - 42, 'Live facts', FAINT);
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
  await adapter.prepareIcons([ICON_SVGS.sparkles]);
  fs.mkdirSync(outDir, { recursive: true });
  const pitch = Math.max(27, face.lineHeight + 4);
  for (const [name, paint] of Object.entries(VARIANTS)) {
    const img = new graphics.GrayImage(W, H);
    paint(img, face, pitch);
    png(img.withDrawsBaked(), path.join(outDir, `facts-${name}-lens.png`));
    console.log(name);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
