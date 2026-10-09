const { createRenderContext } = require('./render.cjs');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');

const NOW = Date.parse('2026-10-08T08:40:00-05:00');
const min = (m) => NOW - m * 60_000;

const agents = [
  { section: 'Needs you' },
  { status: 'approval', title: 'Fix reconnect after BLE drop', project: 'faceclaw', at: min(1), summary: 'Arreglé la reconexión; ¿apruebas correr los tests?' },
  { status: 'input', title: 'Revisar PR #1221 jelou-cli', project: 'jelou-cli', at: min(4), summary: 'Listo para fusionar; ¿lo mando a producción?' },
  { section: 'Working' },
  { status: 'working', title: 'Horizonte clock tests', project: 'faceclaw', at: min(0), summary: 'Corriendo los tests nuevos, paso 2 de 3.' },
  { section: 'Recent' },
  { status: 'ready', unread: true, title: 'Analizar repositorio Hello QA', project: 'jelou-qa', at: min(18), summary: 'Kit de QA con dos PRs abiertos sin revisar.' },
  { status: 'failed', title: 'Upgrade NativeScript to 9', project: 'faceclaw', at: min(52), summary: 'Falló el build: falta el NDK 27 en la mini.' },
];

const fullReply = [
  { kind: 'user', id: 'u1', text: 'The glasses lose the connection after a BLE drop. Find why and fix it.' },
  { kind: 'activity', id: 'a1', label: 'Read', detail: 'app/native/ble-session.ts', state: 'completed' },
  { kind: 'activity', id: 'a2', label: 'Search', detail: 'reconnect', state: 'completed' },
  { kind: 'activity', id: 'a3', label: 'Read', detail: 'FaceclawBleService.kt', state: 'completed' },
  { kind: 'activity', id: 'a4', label: 'Edit', detail: 'app/native/ble-session.ts', state: 'completed' },
  { kind: 'assistant', id: 'm1', text: 'Encontré la causa. Después de una caída de BLE, la sesión conserva el handle GATT viejo, así que cada reintento escribe sobre una conexión muerta y el firmware nunca recibe el saludo. Cambié `BleSession.onDisconnect` para que libere el handle y reinicie el estado, y agregué un backoff de 1 s a 30 s con jitter para no saturar el radio. También quité un `setTimeout` duplicado que disparaba dos reconexiones a la vez. Antes de cerrar quiero correr la suite de BLE para confirmar que no rompí el emparejamiento inicial.', streaming: false },
  { kind: 'request', id: 'r1', label: 'Approve command', detail: 'npm test -- ble-session', resolved: false },
];

function main() {
  const { load, graphics, uiFonts, truncateText, rect, TtfFont, adapter } = createRenderContext();
  const { Menu } = load('app/ui/menu-core.ts');
  const { lineStep } = load('app/ui/metrics.ts');
  const { wrapText } = load('app/graphics/textwrap.ts');
  const { threadMarker, threadStatusLabel, formatAge } = load('app/apps/t3code/t3-model.ts');
  const { TranscriptLayout } = load('app/apps/t3code/t3-transcript.ts');
  const f = uiFonts.getDefaultSmallFont();
  const big = TtfFont.load(adapter.fontPath, 26);
  const step = lineStep(f);
  const W = rect.width;
  const H = rect.height;

  function save(image, name) {
    const out = new graphics.GrayImage(640, 480);
    out.bitBlt(image.withDrawsBaked(), rect.x, rect.y);
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

  function drawRow({ image, item, x, y, width, height, selected }) {
    if (item.kind === 'heading') {
      image.drawText(f, x + 4, y + height - f.lineHeight - 2, item.label, 140);
      return;
    }
    const value = selected ? 255 : 210;
    const top = y + 4;
    if (item.marker) image.drawText(f, x + 6, top, item.marker, selected ? 255 : item.markerValue);
    const right = truncateText(f, item.right, Math.floor(width * 0.36));
    const rightWidth = f.measureText(right) + 12;
    image.drawText(f, x + 24, top, truncateText(f, item.label, width - 30 - rightWidth), value);
    image.drawText(f, x + width - 6 - f.measureText(right), top, right, selected ? 190 : 110);
    image.drawText(f, x + 24, top + f.lineHeight + 1, truncateText(f, item.summary, width - 30), selected ? 200 : 130);
  }

  {
    const image = new graphics.GrayImage(W, H, 0);
    image.drawText(f, 18, 8, 'Paseo', 220);
    image.drawText(f, 18 + f.measureText('Paseo') + 16, 8, '2 need you · 1 working', 150);
    const rowH = f.lineHeight * 2 + 9;
    const items = agents.map((a) => {
      if (a.section) return { kind: 'heading', label: a.section };
      const { marker, value } = threadMarker(a.status, { unread: a.unread });
      return { kind: 'agent', label: a.title, right: `${a.project} · ${formatAge(a.at, NOW)}`, summary: a.summary, marker, markerValue: value, onSelect() {} };
    });
    const menu = new Menu({ wrap: false, rowGap: 1, getHeight: (i) => (i.kind === 'heading' ? f.lineHeight + 4 : rowH), isSelectable: (i) => Boolean(i.onSelect), onSelect() {}, draw: drawRow });
    menu.setItems(items, 1);
    const top = 8 + step + 2;
    menu.paint(image, { x: 12, y: top, width: W - 32, height: H - top - 4 }, true);
    menu.drawScrollbar(image, W - 10, top + 2, H - top - 8);
    save(image, 'paseo-list');
  }

  function header(image, title, status) {
    const label = threadStatusLabel(status);
    image.drawText(f, 14, 6, truncateText(f, title, W - 50 - f.measureText(label)), 225);
    image.drawText(f, W - 18 - f.measureText(label), 6, label, 150);
    image.drawLine(12, 24, W - 16, 24, 40);
  }

  {
    const image = new graphics.GrayImage(W, H, 0);
    header(image, 'Fix reconnect after BLE drop', 'approval');
    const width = W - 14 - 18;
    const lines = wrapText(big, 'Arreglé la reconexión tras una caída de BLE; ¿apruebas correr los tests?', width);
    let y = 44;
    for (const line of lines) {
      image.drawText(big, 14, y, line, 255);
      y += big.lineHeight + 4;
    }
    y += 10;
    image.drawText(f, 14, y, 'Approve command', 210);
    image.drawText(f, 24, y + step, 'npm test -- ble-session', 160);
    const footY = H - step - 4;
    image.drawText(f, 14, footY, 'Luna summary · 110 words', 90);
    const hint = '● approve    scroll: full reply';
    image.drawText(f, W - 18 - f.measureText(hint), footY, hint, 200);
    save(image, 'paseo-summary');
  }

  {
    const image = new graphics.GrayImage(W, H, 0);
    header(image, 'Fix reconnect after BLE drop', 'approval');
    const width = W - 14 - 18;
    const bodyTop = 32;
    const visible = Math.floor((H - bodyTop - step - 8) / step);
    const lines = new TranscriptLayout().layout(fullReply, f, width);
    const first = Math.max(0, lines.length - visible);
    for (let row = 0; row < visible; row++) {
      const line = lines[first + row];
      if (line?.text) image.drawText(f, 14 + line.indent, bodyTop + row * step, line.text.replace('→ ', '> '), line.value);
    }
    const track = visible * step;
    const thumb = Math.max(8, Math.floor((track * visible) / lines.length));
    image.fillRect(W - 8, bodyTop + track - thumb, 2, thumb, 110);
    const hint = '● approve    double tap: summary';
    image.drawText(f, W - 18 - f.measureText(hint), H - step - 4, hint, 200);
    save(image, 'paseo-full');
  }
}

main();
