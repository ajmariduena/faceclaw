const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const { graphics } = createRenderContext();
const PITCH = 27;
const FOOTER_TOP = 288 - 4 - 40;
const CONTENT_BOTTOM = FOOTER_TOP - 8;

function save(band, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  const file = path.join(__dirname, 'out', `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  console.log(file);
}

async function main() {
  const face = await stockFont(graphics);
  const text = (image, x, y, label, value, width) => {
    assert.ok(face.measureLine(label) <= width, `overflow: ${label}`);
    face.drawText(image, x, y, label, value);
  };
  const wrap = (label, width) => {
    const lines = [];
    let line = '';
    for (const word of label.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (face.measureLine(next) <= width) line = next; else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines;
  };
  // Same chat rules as the Paseo app: user right, assistant left, one rule above the newest turn.
  const chat = (name, turns, footer) => {
    const image = new graphics.GrayImage(576, 288);
    image.drawRoundedRect(4, 4, 568, 280, 255, 8);
    image.fillRect(14, FOOTER_TOP, 548, 1, 119);
    text(image, 22, FOOTER_TOP + 8, footer.left, 119, 300);
    if (footer.right) text(image, 554 - face.measureLine(footer.right), FOOTER_TOP + 8, footer.right, 119, 260);
    const left = 22, right = 554, gap = 26;
    const blocks = turns.map((t, i) => {
      const latest = i === turns.length - 1;
      const you = t.kind === 'you';
      const width = right - left - (you ? 64 : t.kind === 'action' ? 20 : 0);
      const lines = wrap(t.text, width);
      const value = t.kind === 'action' ? 119 : you ? (latest ? 255 : 153) : latest ? 255 : 187;
      return { you, latest, kind: t.kind, lines, value, height: lines.length * PITCH };
    });
    const shown = [];
    let used = 0;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const h = blocks[i].height + (shown.length ? gap : 0);
      if (used + h > CONTENT_BOTTOM - 16) break;
      shown.unshift(blocks[i]);
      used += h;
    }
    let y = CONTENT_BOTTOM - used;
    shown.forEach((b, i) => {
      if (i > 0 && b.latest) image.fillRect(14, y - Math.round(gap / 2) - 1, 548, 1, 119);
      b.lines.forEach((line, j) => {
        if (b.kind === 'action' && j === 0) text(image, left, y, '>', 119, 20);
        const x = b.you ? right - face.measureLine(line) : b.kind === 'action' ? left + 20 : left;
        text(image, x, y + j * PITCH, line, b.value, right - left);
      });
      y += b.height + gap;
    });
    save(image, name);
  };

  chat('aichat-empty', [{ kind: 'ai', text: 'Ask me anything.' }], { left: '· AI Chat', right: 'Sonnet' });
  chat('aichat-listening', [
    { kind: 'ai', text: 'Ask me anything.' },
    { kind: 'you', text: '¿Cuánto es 18% de propina sobre 64 dólares?' },
  ], { left: '· Listening', right: '0:03' });
  chat('aichat-answer', [
    { kind: 'you', text: '¿Cuánto es 18% de propina sobre 64 dólares?' },
    { kind: 'ai', text: 'Son 11,52 dólares; el total queda en 75,52.' },
    { kind: 'you', text: 'Y pon un timer de 10 minutos para el café.' },
    { kind: 'action', text: 'Timer · 10 min' },
    { kind: 'ai', text: 'Listo, te aviso a las 20:17.' },
  ], { left: '· AI Chat', right: 'Sonnet' });
  chat('aichat-thinking', [
    { kind: 'you', text: '¿Qué diferencia hay entre Soniox y Deepgram para español?' },
    { kind: 'ai', text: '…' },
  ], { left: '· Thinking', right: '1.4s' });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
