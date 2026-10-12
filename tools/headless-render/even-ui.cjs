// Production menus in the UI font: EVEN_FONT=1 node even-ui.cjs for the
// extracted system font, plain for the Roboto stand-in. Writes out/even-ui-<font>-<scene>.png.
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');

const context = createRenderContext();
const { load, graphics, uiFonts } = context;
const { MenuLayer } = load('app/ui/menu.ts');
const tag = process.env.EVEN_FONT === '1' ? 'even' : 'roboto';
const W = 576, H = 288;

function png(image, name) {
  const rgba = new Uint8Array(image.width * image.height * 4);
  for (let i = 0; i < image.pixels.length; i++) {
    const v = graphics.grayToNibble(image.pixels[i]) * 17;
    rgba.set([Math.round(v * 0.45), v, Math.round(v * 0.5), 255], i * 4);
  }
  fs.writeFileSync(path.join(__dirname, 'out', `even-ui-${tag}-${name}.png`), Buffer.from(UPNG.encode([rgba.buffer], image.width, image.height, 0)));
}

const scenes = {
  settings: ['Display', 'Brightness', 'Notifications', 'Even AI', 'Head-up angle', 'About'],
  apps: ['Teleprompter', 'Navigation', 'Translate', 'Converse', 'Calendar', 'Timers'],
};
for (const [name, labels] of Object.entries(scenes)) {
  const menu = new MenuLayer(name === 'settings' ? 'Settings' : 'Apps', labels.map((label) => ({ label, onSelect() {} })), {
    x: 0, y: 0, width: W, minHeight: H, maxHeight: H, opaque: true, showBorder: false,
  });
  const ctx = { stack: { getBaseSize: () => ({ width: W, height: H }), isFocused: () => true } };
  png(menu.paint(ctx, () => new graphics.GrayImage(W, H)).withDrawsBaked(), name);
}
const text = new graphics.GrayImage(W, H);
const font = uiFonts.getDefaultSmallFont();
['The quick brown fox jumps over the lazy dog', 'AVATAR Today · Configuración · Ñandú', '0123456789 12:45 PM 82%'].forEach((line, i) => font.drawText(text, 20, 20 + i * font.lineHeight, line, 255));
png(text.withDrawsBaked(), 'text');
console.log(tag, font.atlasKey, font.lineHeight);

// The lean screens with the face terminalFace() hands them: the system font at its 29 px pitch.
(async () => {
  const { stockFont } = require('./stock-font.cjs');
  const { ICON_SVGS } = load('app/graphics/icons.ts');
  const { COLUMN_ICONS, CARD_ICONS } = require('./home-column.cjs');
  const system = load('app/graphics/stock-ui-font.ts').StockUiFont.get();
  const face = system
    ? { lineHeight: system.lineHeight, measureLine: (t) => system.measureText(t), drawText: (img, x, y, t, v = 255) => system.drawText(img, x, y, t, v) }
    : await stockFont(graphics);
  load('app/graphics/terminal-painter.ts').applyTextLayout(face.lineHeight);
  load('app/ui/terminal.ts').applyTextLayout(face.lineHeight);
  const { paintHome } = load('app/apps/home/home-painter.ts');
  const { calendarCardState } = load('app/apps/home/home-model.ts');
  const { paintConverse } = load('app/apps/converse/converse-painter.ts');
  const NOW = new Date(2026, 9, 10, 9, 41);
  const at = (h, m = 0) => new Date(2026, 9, 10, h, m).getTime();
  const daily = { title: 'Daily con el equipo', startMs: at(10, 30), endMs: at(11), allDay: false };
  const lunch = { title: 'Almuerzo con Lucía', startMs: at(13), endMs: at(14), allDay: false, location: 'Café Jardín' };
  const paseo = { configured: true, status: '', needs: 1, working: 1, updates: [
    { agentId: 'a1', title: 'Fix reconnect BLE', bucket: 'needs', activityMs: NOW.getTime() - 60_000, line: '¿Apruebo correr los tests de BLE?' },
  ] };
  await context.adapter.prepareIcons([...new Set([...COLUMN_ICONS, ...CARD_ICONS])].map((name) => ICON_SVGS[name]));
  for (const [name, selected, extra] of [['home-paseo', 0, { paseo }], ['home-calendar', 2, {}], ['home-converse', 4, {}]]) {
    const data = { now: NOW, calendar: calendarCardState(true, [daily, lunch], NOW.getTime()), paseo: null, battery: { ring: 60, glasses: 82 },
      weather: { temperatureC: 27.4, code: 2, isDay: true, atMs: NOW.getTime() }, ...extra };
    png(paintHome(selected, data, face).withDrawsBaked(), name);
  }
  const converse = new graphics.GrayImage(W, H);
  paintConverse(converse, face, {
    fact: { topic: 'Parque Nacional Cajas', source: '', text: 'No es Patrimonio de la Humanidad de la UNESCO; es reserva de biosfera.' },
    previous: { topic: 'Cajas', source: '', text: 'El Parque Nacional Cajas está a media hora en coche de Cuenca.' },
    status: { label: '', bright: false }, message: null,
  });
  png(converse.withDrawsBaked(), 'converse');
})().catch((error) => { console.error(error); process.exit(1); });
