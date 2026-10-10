// The lean home through the production painter: the left column (dot-matrix
// clock, day, ring/glasses gauges, weather, Paseo needs-you) beside the Paseo,
// Calendar and Translate cards at 09:41 and 22:07. Run from this folder:
//   node home-column.cjs
// Writes out/home-column-<card>-<hhmm>.png (640x480, band at 32,96, 16 levels).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const COLUMN_ICONS = ['calendar', 'circle', 'glasses', 'battery', 'sun', 'moon', 'cloud', 'cloud-sun', 'cloud-moon', 'cloud-rain', 'cloud-lightning', 'square-terminal'];
const CARD_ICONS = ['square-terminal', 'calendar-days', 'languages', 'messages-square', 'layout-grid'];

function save(graphics, band, name) {
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(band.withDrawsBaked(), 32, 96);
  const rgba = new Uint8Array(640 * 480 * 4);
  const levels = new Set();
  for (let i = 0; i < out.pixels.length; i++) {
    const v = graphics.grayToNibble(out.pixels[i]) * 17;
    levels.add(v);
    rgba.set([v, v, v, 255], i * 4);
  }
  assert.ok(levels.size <= 16);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  const file = path.join(__dirname, 'out', `${name}.png`);
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], 640, 480, 0)));
  return file;
}

const at = (h, m, day = 10) => new Date(2026, 9, day, h, m);
/** The painter input for one clock time: three events, two Paseo updates, both batteries and a reading. */
function scenes(now, calendarCardState) {
  const nowMs = now.getTime();
  const calendar = calendarCardState(true, [
    { title: 'Daily con el equipo', startMs: at(10, 30).getTime(), endMs: at(11, 0).getTime(), allDay: false },
    { title: 'Revisión del plan de soporte', startMs: at(14, 0).getTime(), endMs: at(15, 0).getTime(), allDay: false },
    { title: 'Dentista', startMs: at(9, 0, 11).getTime(), endMs: at(10, 0, 11).getTime(), allDay: false },
  ], nowMs);
  const paseo = { configured: true, status: '', needs: 2, working: 1, updates: [
    { agentId: 'a', title: 'Fix reconnect after BLE drop', bucket: 'needs', activityMs: nowMs - 60_000, line: '¿Apruebas correr los tests de BLE?' },
    { agentId: 'b', title: 'Revisar PR #1221 jelou-cli', bucket: 'ready', activityMs: nowMs - 240_000, line: 'Listo para fusionar a producción.' },
  ] };
  const isDay = now.getHours() >= 6 && now.getHours() < 18;
  return {
    now, calendar, paseo, translateReady: true,
    battery: { ring: 72, glasses: 88 },
    weather: { temperatureC: isDay ? 27.4 : 22.6, code: isDay ? 2 : 0, isDay, atMs: nowMs },
  };
}

/** Paint the six scenes through the production painter; yields { name, image } with the band still unbaked. */
async function* renderHomeColumn(context) {
  const { graphics, adapter, load } = context;
  const { paintHome } = load('app/apps/home/home-painter.ts');
  const { calendarCardState } = load('app/apps/home/home-model.ts');
  const { ICON_SVGS } = load('app/graphics/icons.ts');
  const face = await stockFont(graphics);
  await adapter.prepareIcons([...new Set([...COLUMN_ICONS, ...CARD_ICONS])].map(name => ICON_SVGS[name]));
  for (const [hh, mm] of [[9, 41], [22, 7]]) {
    const data = scenes(at(hh, mm), calendarCardState);
    for (const [index, name] of [[0, 'paseo'], [1, 'calendar'], [2, 'translate']]) {
      yield { name: `home-column-${name}-${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}`, data, face, image: paintHome(index, data, face) };
    }
  }
}

async function main() {
  const context = createRenderContext();
  for await (const { name, image } of renderHomeColumn(context)) console.log(path.relative(process.cwd(), save(context.graphics, image, name)));
}

module.exports = { scenes, renderHomeColumn, COLUMN_ICONS, CARD_ICONS, save };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
