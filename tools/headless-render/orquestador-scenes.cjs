const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const { graphics, load } = createRenderContext();
const painter = load('app/apps/paseo/paseo-painter.ts');

function save(band, name) {
  const rgba = new Uint8Array(576 * 288 * 4);
  const baked = band.withDrawsBaked();
  for (let i = 0; i < baked.pixels.length; i++) {
    const v = graphics.grayToNibble(baked.pixels[i]) * 17;
    rgba.set([v, v, v, 255], i * 4);
  }
  const file = path.join(__dirname, 'out', `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 576, 288, 0)));
  console.log(file);
}

const list = (face, name, rows, selected, footerRight) => {
  const image = new graphics.GrayImage(576, 288);
  painter.paintList(image, face, { rows, selected, footerRight }, 0);
  save(image, name);
};
const chat = (face, name, lines, footer, permission = null) => {
  const image = new graphics.GrayImage(576, 288);
  painter.paintChat(image, face, { lines, scrollBack: 0, full: true, footer, permission });
  save(image, name);
};

async function main() {
  const face = await stockFont(graphics);
  const agents = [
    { kind: 'section', label: 'Needs input', count: 1 },
    { kind: 'agent', title: 'Fix reconnect after BLE drop', key: 'a1' },
    { kind: 'section', label: 'Working', count: 2 },
    { kind: 'agent', title: 'Faceclaw v3 home', key: 'a2' },
    { kind: 'agent', title: 'jelou-cli tests', key: 'a3' },
  ];
  list(face, 'orq-1-list', [{ kind: 'agent', title: 'Orchestrator', key: 'orq' }, ...agents], 0, '1 needs · 2 working');
  chat(face, 'orq-2-chat', [
    { role: 'user', text: '¿Cómo van los tests de jelou-cli?' },
    { role: 'assistant', text: 'jelou-cli terminó la corrida de tests.\nPasaron los 214 y no quedan cambios pendientes.', action: true },
    { role: 'user', text: 'Bien, archívalo.' },
    { role: 'assistant', text: 'Listo, archivé jelou-cli.' },
  ], { left: '· Orchestrator', right: 'Ready' });
  chat(face, 'orq-3-listening', [
    { role: 'user', text: 'Bien, archívalo.' },
    { role: 'assistant', text: 'Listo, archivé jelou-cli.' },
    { role: 'user', text: 'Abre un agente en faceclaw que revise el lint', live: true },
  ], { left: '· Listening', right: '0:04' });
  chat(face, 'orq-4-permission', [
    { role: 'assistant', text: 'Fix reconnect after BLE drop pide permiso.', action: true },
  ], null, { question: 'Allow Claude to run git push origin main?', options: ['Allow once', 'Deny'], selected: 0 });
  list(face, 'orq-5-minimized', [{ kind: 'agent', title: 'Orchestrator · 1 new', key: 'orq' }, ...agents], 0, '1 needs · 2 working');
  chat(face, 'orq-6-thinking', [
    { role: 'assistant', text: 'Listo, archivé jelou-cli.' },
    { role: 'user', text: 'Abre un agente en faceclaw que revise el lint.' },
  ], { left: '· Thinking', right: '1.4s' });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
