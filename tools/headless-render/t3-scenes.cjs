const { createRenderContext } = require('./render.cjs');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');

const NOW = Date.parse('2026-10-07T20:10:00-05:00');
const min = (m) => NOW - m * 60_000;

const threads = [
  { section: 'Needs you' },
  { status: 'approval', title: 'Fix reconnect after BLE drop', project: 'faceclaw', at: min(1) },
  { status: 'input', title: 'Migrate payroll export to CSV', project: 'payroll', at: min(4) },
  { section: 'Working' },
  { status: 'working', title: 'Horizonte clock tests', project: 'faceclaw', at: min(0) },
  { status: 'working', title: 'Relay pairing spike', project: 'paseo', at: min(7) },
  { section: 'Recent' },
  { status: 'ready', unread: true, title: 'Calendar card shows next events', project: 'faceclaw', at: min(18) },
  { status: 'failed', title: 'Upgrade NativeScript to 9', project: 'faceclaw', at: min(52) },
  { status: 'ready', settled: true, title: 'Translate captions in Spanish', project: 'faceclaw', at: min(180) },
];

const approvalTimeline = [
  { kind: 'user', id: 'u1', text: 'The glasses lose the connection after a BLE drop. Find why and fix it.' },
  { kind: 'activity', id: 'a1', label: 'Read', detail: 'app/native/ble-session.ts', state: 'completed' },
  { kind: 'activity', id: 'a2', label: 'Search', detail: 'reconnect', state: 'completed' },
  { kind: 'activity', id: 'a3', label: 'Read', detail: 'FaceclawBleService.kt', state: 'completed' },
  { kind: 'activity', id: 'a4', label: 'Edit', detail: 'app/native/ble-session.ts', state: 'completed' },
  { kind: 'assistant', id: 'm1', text: 'The session keeps the old GATT handle after a drop, so every retry writes to a dead connection. I reset it on disconnect and back off from 1 s to 30 s.', streaming: false },
  { kind: 'request', id: 'r1', label: 'Approve command', detail: 'npm test -- ble-session', resolved: false },
];

const workingTimeline = [
  { kind: 'user', id: 'u1', text: 'Add tests for the Horizonte clock: no events, all-day, now.' },
  { kind: 'activity', id: 'a1', label: 'Read', detail: 'app/apps/home/horizonte.ts', state: 'completed' },
  { kind: 'activity', id: 'a2', label: 'Write', detail: 'tests/horizonte-home.test.cjs', state: 'completed' },
  { kind: 'assistant', id: 'm1', text: 'Added three cases. The all-day case found a bug: the label said "en 0 min". Fixing it now.', streaming: false },
  { kind: 'activity', id: 'a3', label: 'Edit', detail: 'app/apps/home/horizonte.ts', state: 'completed' },
  { kind: 'activity', id: 'a4', label: 'Run', detail: 'node --test tests/horizonte-home.test.cjs', state: 'running' },
  { kind: 'assistant', id: 'm2', text: '', streaming: true },
];

function main() {
  const { load, graphics, uiFonts, truncateText, rect } = createRenderContext();
  const { Menu } = load('app/ui/menu-core.ts');
  const { lineStep, listRowHeight } = load('app/ui/metrics.ts');
  const { threadMarker, threadStatusLabel, formatAge } = load('app/apps/t3code/t3-model.ts');
  const { TranscriptLayout } = load('app/apps/t3code/t3-transcript.ts');
  const f = uiFonts.getDefaultSmallFont();
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

  function drawListRow({ image, item, x, y, width, height, selected }) {
    const textY = y + Math.max(0, Math.floor((height - f.lineHeight) / 2));
    if (item.kind === 'heading') {
      image.drawText(f, x + 4, textY, truncateText(f, item.label, width - 8), selected ? 255 : 140);
      return;
    }
    const value = selected ? 255 : 200;
    if (item.marker) image.drawText(f, x + 6, textY, item.marker, selected ? 255 : item.markerValue ?? value);
    const right = item.right ? truncateText(f, item.right, Math.floor(width * 0.42)) : '';
    const rightWidth = right ? f.measureText(right) + 12 : 0;
    const labelX = x + 24;
    image.drawText(f, labelX, textY, truncateText(f, item.label, Math.max(10, width - (labelX - x) - rightWidth - 6)), value);
    if (right) image.drawText(f, x + width - 6 - f.measureText(right), textY, right, selected ? 200 : 120);
  }

  {
    const image = new graphics.GrayImage(W, H, 0);
    image.drawText(f, 18, 10, 'T3 Code', 220);
    image.drawText(f, 18 + f.measureText('T3 Code') + 16, 10, '2 need you · 2 working', 150);
    const items = threads.map((t) => {
      if (t.section) return { kind: 'heading', label: t.section };
      const { marker, value } = threadMarker(t.status, { settled: t.settled, unread: t.unread });
      return { kind: 'thread', label: t.title, right: `${t.project} · ${formatAge(t.at, NOW)}`, marker, markerValue: value, onSelect() {} };
    });
    const menu = new Menu({ wrap: false, rowGap: 1, getHeight: () => listRowHeight(f), isSelectable: (i) => Boolean(i.onSelect), onSelect() {}, draw: drawListRow });
    menu.setItems(items, 1);
    const listTop = 10 + step + 8;
    const listHeight = H - 6 - listTop;
    menu.paint(image, { x: 12, y: listTop - 2, width: W - 32, height: listHeight }, true);
    menu.drawScrollbar(image, W - 10, listTop, listHeight - 4);
    save(image, 't3-list');
  }

  function paintThread(name, title, status, timeline, footer, plan) {
    const image = new graphics.GrayImage(W, H, 0);
    const width = W - 14 - 18;
    const label = threadStatusLabel(status);
    image.drawText(f, 14, 6, truncateText(f, title, width - f.measureText(label) - 12), 225);
    image.drawText(f, W - 18 - f.measureText(label), 6, label, 150);
    image.drawLine(12, 24, W - 16, 24, 40);
    const bodyTop = 32;
    const footerLines = plan ? 2 : 1;
    const visible = Math.floor((H - bodyTop - footerLines * step - 8) / step);
    const lines = new TranscriptLayout().layout(timeline, f, width);
    const first = Math.max(0, lines.length - visible);
    for (let row = 0; row < visible; row++) {
      const line = lines[first + row];
      if (line?.text) image.drawText(f, 14 + line.indent, bodyTop + row * step, line.text, line.value);
    }
    let footerY = H - step - 4;
    image.drawText(f, W - 18 - f.measureText(footer.text), footerY, footer.text, footer.value);
    if (plan) image.drawText(f, 14, footerY - step, truncateText(f, plan, width), 160);
    save(image, name);
  }

  paintThread('t3-approval', 'Fix reconnect after BLE drop', 'approval', approvalTimeline, { text: '● respond to approval', value: 255 });
  paintThread('t3-working', 'Horizonte clock tests', 'working', workingTimeline, { text: '● reply', value: 110 }, 'Plan 2/3 · Run the new tests');
}

main();
