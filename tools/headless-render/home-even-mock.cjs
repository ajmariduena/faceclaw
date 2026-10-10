const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const context = createRenderContext();
const { graphics, TtfFont, adapter, load } = context;
const { paintHome } = load('app/apps/home/home-painter.ts');
const { calendarCardState } = load('app/apps/home/home-model.ts');
const art = load('app/apps/home/stock-art.ts');
const { ICON_SVGS } = load('app/graphics/icons.ts');

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

// Stock-like left column: day, ring/glasses batteries, stacked dot digits, weather and Paseo count.
function column(image, { day, hh, mm, ring, glasses, temp, needs }, svgIcon) {
  image.fillRect(0, 0, 214, 288, 0);
  art.dotText(image, 22, 21, day);
  const battery = (x, letter, level) => {
    art.dotText(image, x, 21, letter, 255);
    for (let i = 0; i < 4; i++) image.fillRect(x + 14 + i * 4, 21, 2, 14, i < level ? 255 : 68);
  };
  battery(128, 'R', ring);
  battery(172, 'G', glasses);
  for (const [value, y] of [[hh, 69], [mm, 149]]) {
    for (let i = 0; i < 2; i++) image.drawImage(art.digit(graphics, value[i]), 58 + i * 62, y);
  }
  image.drawImage(svgIcon('cloud-sun', 22), 22, 250);
  art.dotText(image, 52, 254, temp);
  image.drawImage(svgIcon('square-terminal', 22), 150, 250);
  art.dotText(image, 180, 254, String(needs));
}

async function main() {
  const face = await stockFont(graphics);
  const clockFont = TtfFont.load(adapter.fontPath, 80);
  const clockFace = { lineHeight: clockFont.lineHeight, measureLine: (t) => clockFont.measureText(t), drawText: (...a) => clockFont.drawText(...a) };
  const icons = ['cloud-sun', 'square-terminal', 'calendar-days', 'languages', 'messages-square', 'layout-grid'];
  await adapter.prepareIcons(icons.map((n) => ICON_SVGS[n]));
  const svgIcon = (name, size) => adapter.rasterizeSvg(ICON_SVGS[name], size, 2, graphics.GrayImage);
  const now = new Date(2026, 9, 10, 9, 41);
  const at = (h, m) => new Date(2026, 9, 10, h, m).getTime();
  const calendar = calendarCardState(true, [
    { title: 'Daily con el equipo', startMs: at(10, 30), endMs: at(11, 0), allDay: false },
    { title: 'Revisión del plan de soporte', startMs: at(14, 0), endMs: at(15, 0), allDay: false },
  ], now.getTime());
  const paseo = { configured: true, status: '', needs: 1, working: 2, counts: { needs: 1, failed: 0, review: 0, working: 2, done: 3 }, lastSeenMs: null, lastCounts: null, updates: [
    { agentId: 'a', title: 'Fix reconnect after BLE drop', bucket: 'needs-input', activityMs: now.getTime() - 60_000, line: '¿Apruebas correr los tests de BLE?' },
    { agentId: 'b', title: 'Revisar PR #1221 jelou-cli', bucket: 'ready', activityMs: now.getTime() - 240_000, line: 'Listo para fusionar a producción.' },
  ] };
  const state = { day: 'Sat 10', hh: '09', mm: '41', ring: 3, glasses: 4, temp: '27°C', needs: 2 };
  for (const [index, name] of [[0, 'paseo'], [1, 'calendar'], [2, 'translate']]) {
    const home = paintHome(index, { now, calendar, paseo, translateReady: true }, face, clockFace);
    column(home, state, svgIcon);
    save(home, `home-even-${name}`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
