const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const context = createRenderContext();
const { graphics, TtfFont, adapter } = context;

const MORE = ['AI Chat', 'Timers', 'Navigate', 'Settings'];
const SETTINGS = [
  ['Glasses battery', '82%'], ['Ring battery', '64%'], ['Paseo', 'Connected'], ['Soniox', 'OK'],
  ['OpenRouter', 'OK'], ['Parallel', 'Missing'], ['Brightness', 'Auto'], ['Screen off', 'after 15s'],
  ['Distance', '8'], ['Disconnect', ''],
];
const CHAT = [
  ['user', 'Corre los tests de BLE'],
  ['assistant', 'Corrí los 18 tests de BLE y pasan. ¿Hago commit y abro el PR?'],
  ['user', 'Sí, ábrelo'],
  ['assistant', 'Abrí el PR #1221 con el fix de reconexión. Falta tu revisión.'],
];

function save(band, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', `${name}.png`), Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  console.log(name);
}

function fit(face, text, width) {
  if (face.measureLine(text) <= width) return text;
  const chars = Array.from(text);
  while (chars.length && face.measureLine(`${chars.join('').trimEnd()}…`) > width) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

function wrap(face, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (face.measureLine(next) <= width || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function frame(face, pitch, footerLeft, footerRight) {
  const band = new graphics.GrayImage(576, 288);
  band.drawRoundedRect(4, 4, 568, 280, 255, 8);
  const footerTop = 288 - 4 - (pitch + 13);
  band.fillRect(14, footerTop, 548, 1, 119);
  face.drawText(band, 22, footerTop + 8, footerLeft, 119);
  if (footerRight) face.drawText(band, 554 - face.measureLine(footerRight), footerTop + 8, footerRight, 119);
  return { band, footerTop };
}

function list(face, pitch, rows, selected, footer, name) {
  const { band, footerTop } = frame(face, pitch, footer, `${selected + 1}/${rows.length}`);
  const indent = face.measureLine('> ') + 22;
  const capacity = Math.floor((footerTop - 14) / pitch);
  const top = Math.max(0, Math.min(selected - capacity + 1, rows.length - capacity));
  let y = 14;
  for (const [index, [label, value]] of rows.entries()) {
    if (index < top) continue;
    if (y + pitch > footerTop) break;
    const on = index === selected;
    if (on) face.drawText(band, 22, y, '>', 255);
    if (value) face.drawText(band, 554 - face.measureLine(value), y, value, on ? 255 : 136);
    face.drawText(band, indent, y, fit(face, label, 554 - indent - (value ? face.measureLine(value) + 16 : 0)), on ? 255 : 136);
    y += pitch;
  }
  save(band, name);
}

function chat(face, pitch, name) {
  const { band, footerTop } = frame(face, pitch, '· Fix reconnect BLE', 'Ready');
  const lines = [];
  for (const [role, text] of CHAT) {
    const prefix = role === 'user' ? '> ' : '';
    for (const [i, line] of wrap(face, text, 532 - face.measureLine('> ')).entries()) lines.push({ text: (i ? '  ' : prefix) + line, value: role === 'user' ? 136 : 255 });
  }
  const capacity = Math.floor((footerTop - 14) / pitch);
  lines.slice(-capacity).forEach((line, i) => face.drawText(band, 22, 14 + i * pitch, line.text, line.value));
  save(band, name);
}

function ttfFace(size) {
  const font = TtfFont.load(adapter.fontPath, size);
  return { lineHeight: font.lineHeight, measureLine: (t) => font.measureText(t), drawText: (...a) => font.drawText(...a) };
}

async function main() {
  const variants = [
    ['normal', await stockFont(graphics), 27],
    ['large26', ttfFace(26), 34],
    ['large28', ttfFace(28), 37],
  ];
  for (const [name, face, pitch] of variants) {
    list(face, pitch, MORE.map((label) => [label, '']), 0, '· More', `large-${name}-more`);
    list(face, pitch, SETTINGS, 7, '· Settings', `large-${name}-settings`);
    chat(face, pitch, `large-${name}-chat`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
