// The Paseo chat with whole messages, from a real session's text: the newest
// screen, then one screen per scroll back through the history, next to how the
// one-line version showed it. Run from this folder:
//   PASEO_MESSAGES=<messages.json> node paseo-history.cjs
// The JSON is [{ role: "user" | "assistant", text }]. Writes out/phist-*.png.
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const context = createRenderContext();
const { graphics, load } = context;
const terminal = load('app/graphics/terminal-painter.ts');
const { messageText, fallbackLine } = load('app/apps/paseo/paseo-model.ts');
const outDir = path.join(__dirname, 'out');

function png(image, file) {
  const rgba = new Uint8Array(image.width * image.height * 4);
  for (let i = 0; i < image.pixels.length; i++) {
    const v = graphics.grayToNibble(image.pixels[i]) * 17;
    rgba.set([Math.round(v * 0.45), v, Math.round(v * 0.5), 255], i * 4);
  }
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], image.width, image.height, 0)));
}

async function main() {
  const messages = JSON.parse(fs.readFileSync(process.env.PASEO_MESSAGES, "utf8"));
  const face = await stockFont(graphics);
  fs.mkdirSync(outDir, { recursive: true });
  const footer = { left: '· Realtime Translation', right: 'Done' };
  const shot = (name, paint) => {
    const band = new graphics.GrayImage(576, 288);
    paint(band);
    png(band.withDrawsBaked(), path.join(outDir, `phist-${name}.png`));
  };

  shot('antes', (band) => terminal.paintChat(band, face, {
    lines: messages.map((m) => ({ role: m.role, text: fallbackLine(m.text) })), scrollBack: 0, footer, permission: null }));

  const lines = messages.map((m) => ({ role: m.role, text: messageText(m.text) })).filter((l) => l.text);
  const view = { lines, scrollBack: 0, full: true, footer, permission: null };
  const max = terminal.chatMaxScrollBack(face, view);
  const rows = terminal.chatRowCount(face, lines);
  const visible = rows - max;
  const frames = [];
  for (let back = 0; ; back = Math.min(max, back + visible)) {
    frames.push(back);
    if (back === max) break;
  }
  frames.forEach((back, i) => shot(`ahora-${i}`, (band) => terminal.paintChat(band, face, { ...view, scrollBack: back })));

  shot('dictado', (band) => terminal.paintChat(band, face, { ...view,
    lines: [...lines.slice(-2), { role: 'user', text: 'Perfecto, arranca con la pantalla compacta y después medimos la latencia con las grabaciones que te voy a mandar esta tarde', live: true }],
    footer: { left: '· Listening', right: '0:09' } }));

  shot('lista', (band) => terminal.paintList(band, face, {
    rows: [
      { kind: 'section', label: 'Ready to review', count: 1 },
      { kind: 'agent', title: 'Realtime Translation', key: 'a' },
      { kind: 'section', label: 'Working', count: 1 },
      { kind: 'agent', title: 'Faceclaw', key: 'b' },
      { kind: 'section', label: 'Done', count: 2 },
      { kind: 'agent', title: 'Grok Bot Glasses', key: 'c' },
      { kind: 'agent', title: 'jelou-ops', key: 'd' },
    ],
    selected: 1, footerRight: '1 ready · 1 working · 2 done' }, 0));
  console.log(JSON.stringify({ rows, visible, frames: frames.length }));
}
main().catch((e) => { console.error(e); process.exit(1); });
