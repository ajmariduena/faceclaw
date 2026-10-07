const assert = require('node:assert/strict');
const { createScenes: createStockScenes } = require('./stock-scenes.cjs');
const art = require('./stock-art.cjs');

const cards = [
  { id: 'calendar', name: 'Calendario', icon: 'calendar' },
  { id: 'music', name: 'Música', icon: 'music' },
  { id: 'notifications', name: 'Notificaciones', icon: 'bell' },
  { id: 'translate', name: 'Traducir', icon: 'translate', status: 'Toca para empezar' },
  { id: 'more', name: 'Más', icon: 'more', status: 'Toca para ver más apps' },
];
const modes = [
  ...cards.map(card => `v3-home-${card.id}`),
  ...Array.from({ length: 4 }, (_, i) => `v3-enter-${i}`),
  'v3-app-calendar', 'v3-more-list', 'v3-translate-confirm-exit',
  'v3-home-music-empty', 'v3-notification',
];
const durationMs = 200;
const frameTimes = [0, 67, 133, 200];
const textureBytes = 2 * (5 + 576 / 2 * 144);
const arenaBytes = 192 * 1024 - 512 * 4;

async function createV3Scenes(context) {
  const { graphics, rect, load } = context;
  const stock = await createStockScenes(context);
  const { face } = stock;
  const blank = (width = 576, height = 288) => new graphics.GrayImage(width, height);
  const status = blank();
  const text = (image, x, y, label, value = 255, width = image.width - x) => {
    for (const char of label) assert.ok(char === ' ' || face.hasGlyph(char.codePointAt(0)), `Missing stock glyph: ${char}`);
    assert.ok(face.measureLine(label) <= width, `Text overflow: ${label}`);
    assert.ok(y >= 0 && y + face.lineHeight <= image.height, `Line outside image: ${label}`);
    face.drawText(image, x, y, label, value);
  };
  const centered = (image, y, label, value = 255) => text(image, Math.round((image.width - face.measureLine(label)) / 2), y, label, value, image.width - 40);
  const icon = (image, name, x, y, size = 24, value = 255) => image.drawImage(art.icon(graphics, name, size).dimmed(value / 255), x, y);
  const panel = () => {
    const image = blank(318, 260);
    image.drawRoundedRect(0, 0, 318, 260, 255, 6);
    return image;
  };
  const header = (image, card) => {
    icon(image, card.icon, 20, 18);
    text(image, 52, 16, card.name, 255, 246);
  };
  function drawStatus() {
    art.dotText(status, 22, 21, 'Mie 07/10');
    status.drawRect(185, 21, 22, 13, 255);
    status.fillRect(207, 25, 2, 5, 255);
    for (let i = 0; i < 4; i++) status.fillRect(188 + i * 4, 24, 2, 7, i === 3 ? 102 : 255);
    for (const [value, y] of [['09', 69], ['41', 149]]) {
      for (let i = 0; i < 2; i++) status.drawImage(art.digit(graphics, value[i]), 58 + i * 62, y);
    }
    icon(status, 'cloud', 22, 248);
    art.dotText(status, 52, 254, '24°C');
    icon(status, 'bell', 155, 248);
    art.dotText(status, 185, 254, '3');
  }
  drawStatus();
  function translateStatus(image, y) {
    const left = 'ES ', right = ' EN · Toca para empezar';
    const width = face.measureLine(left) + 20 + face.measureLine(right);
    const x = Math.round((image.width - width) / 2);
    text(image, x, y, left, 153);
    const arrowX = x + face.measureLine(left);
    image.fillRect(arrowX, y + 7, 18, 2, 153);
    image.fillRect(arrowX + 2, y + 15, 18, 2, 153);
    for (let step = 0; step < 3; step++) {
      image.fillRect(arrowX + 12 + step * 2, y + 3 + step * 2, 2, 2, 153);
      image.fillRect(arrowX + 12 + step * 2, y + 11 - step * 2, 2, 2, 153);
      image.fillRect(arrowX + 2 + step * 2, y + 15 + step * 2, 2, 2, 153);
      image.fillRect(arrowX + 2 + step * 2, y + 15 - step * 2, 2, 2, 153);
    }
    text(image, arrowX + 20, y, right, 153);
  }
  function genericCard(card, emptyLabel) {
    const image = panel();
    icon(image, card.icon, 135, 54, 48);
    centered(image, 120, card.name);
    if (card.id === 'translate') translateStatus(image, 169);
    else centered(image, 169, emptyLabel || card.status, 153);
    return image.withDrawsBaked();
  }
  function calendarCard() {
    const image = panel();
    header(image, cards[0]);
    text(image, 20, 69, 'Reunión del equipo', 255, 278);
    text(image, 20, 96, 'Sala Norte', 153, 278);
    text(image, 20, 123, 'Hoy 10:30 - 11:00', 153, 278);
    text(image, 20, 183, 'Revisión de diseño', 255, 278);
    text(image, 20, 210, 'Hoy 14:00 - 15:00', 153, 278);
    return image.withDrawsBaked();
  }
  function musicCard() {
    const image = panel();
    header(image, cards[1]);
    text(image, 20, 69, 'Hasta la raíz', 255, 278);
    text(image, 20, 96, 'Natalia Lafourcade', 153, 278);
    text(image, 20, 139, 'Sonando', 153, 278);
    image.fillRect(20, 188, 278, 2, 68);
    image.fillRect(20, 188, 118, 2, 255);
    text(image, 20, 202, '1:42', 153, 70);
    text(image, 298 - face.measureLine('4:20'), 202, '4:20', 153, 70);
    image.fillRect(152, 211, 3, 12, 255);
    image.fillRect(161, 211, 3, 12, 255);
    return image.withDrawsBaked();
  }
  function notificationsCard() {
    const image = panel();
    header(image, cards[2]);
    text(image, 20, 69, 'Lucía · Mensajes', 255, 278);
    text(image, 20, 96, 'Mesa para las 18:30.', 153, 278);
    text(image, 20, 123, 'Hace 2 min', 153, 278);
    text(image, 20, 183, 'Calendario', 255, 278);
    text(image, 20, 210, 'Reunión en 49 min.', 153, 278);
    return image.withDrawsBaked();
  }
  function home(id = 'calendar', empty = false) {
    const selected = cards.findIndex(card => card.id === id);
    assert.ok(selected >= 0, `Unknown card: ${id}`);
    const painters = { calendar: calendarCard, music: musicCard, notifications: notificationsCard };
    const image = blank();
    image.bitBlt(status.withDrawsBaked(), 0, 0);
    const emptyLabels = { calendar: 'Sin eventos hoy', music: 'Nada sonando', notifications: 'Sin notificaciones' };
    const visible = empty && emptyLabels[id] ? genericCard(cards[selected], emptyLabels[id]) : painters[id] ? painters[id]() : genericCard(cards[selected]);
    image.bitBlt(visible, 230, 14);
    for (let i = 0; i < cards.length; i++) image.fillRect(218, 120 + i * 11, i === selected ? 4 : 2, 3, i === selected ? 255 : 85);
    return image;
  }
  function moreList() {
    const image = blank();
    icon(image, 'more', 22, 17);
    text(image, 54, 14, 'Más');
    const items = [['Conversar', 'people'], ['AI Chat', 'ai'], ['Teleprompter', 'prompt'], ['Navegar', 'navigate'], ['Timers', 'timer'], ['Ajustes', 'settings']];
    items.forEach(([label, name], index) => {
      const y = 52 + index * 37;
      if (index === 0) image.drawRoundedRect(18, y, 540, 35, 255, 6);
      icon(image, name, 34, y + 6, 24, index === 0 ? 255 : 153);
      text(image, 72, y + 4, label, index === 0 ? 255 : 153, 462);
    });
    return image.withDrawsBaked();
  }
  function translateConfirmExit() {
    const background = blank();
    icon(background, 'translate', 22, 17);
    text(background, 54, 14, 'Traducir · Español ↔ Inglés');
    icon(background, 'ai', 22, 52, 24, 153);
    text(background, 54, 49, 'Grabando · 00:42', 153);
    text(background, 22, 196, 'La reunión empieza a las diez y media.', 153, 532);
    text(background, 22, 234, 'The meeting starts at half past ten.', 255, 532);
    const image = background.withDrawsBaked().dimmed(0.25);
    image.fillRoundedRect(101, 79, 374, 124, 0, 6);
    image.drawRoundedRect(101, 79, 374, 124, 255, 6);
    centered(image, 91, '¿Detener y salir?');
    centered(image, 133, '> Seguir');
    centered(image, 168, 'Salir', 153);
    return image.withDrawsBaked();
  }
  function notification() {
    const image = home().dimmed(0.25);
    image.fillRoundedRect(46, 28, 494, 151, 0, 6);
    image.drawRoundedRect(46, 28, 494, 151, 255, 6);
    icon(image, 'message', 62, 46);
    text(image, 100, 43, 'Mensajes', 255, 260);
    const time = 'hace 2 min';
    text(image, 526 - face.measureLine(time), 43, time, 153, 140);
    text(image, 100, 80, 'Lucía Andrade', 255, 426);
    text(image, 100, 107, 'Ya reservé la mesa para las 18:30.', 255, 426);
    text(image, 100, 134, 'Nos vemos en el café de siempre.', 255, 426);
    return image.withDrawsBaked();
  }
  function transition(elapsedMs, returning = false) {
    assert.ok(Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs <= durationMs);
    const source = returning ? stock.calendarFunction() : home();
    const target = returning ? home() : stock.calendarFunction();
    const { DrawExpression: E } = load('app/graphics/draw-expression.ts');
    const { DrawOp, SCREEN, encodeDisplayList, readDisplayList, paintDisplayList } = load('app/graphics/display-list.ts');
    const offset = E.progress(durationMs).ease().lerp(E.f32(0), E.f32(576)).toInt();
    const clip = { x: 0, y: 0, width: 576, height: 288 };
    const resources = [0, 144].map(top => ({ width: 576, height: 144, pixels: target.pixels.slice(top * 576, (top + 144) * 576) }));
    const calls = [{ op: DrawOp.RECT_COPY, resource: SCREEN, x: 0, y: 0, width: 576, height: 288, dx: returning ? offset : offset.neg(), dy: 0, clip }];
    for (let i = 0; i < 2; i++) calls.push({ op: DrawOp.RECT_COPY, resource: i, x: 0, y: 0, width: 576, height: 144, dx: returning ? offset.sub(E.i32(576)) : E.i32(576).sub(offset), dy: i * 144, clip });
    assert.ok(textureBytes + resources.length * 16 < arenaBytes);
    const encoded = encodeDisplayList({ x: 0, y: 0, width: 576, height: 288, depth: 0, displayList: { resources, calls, timeline: { token: 3, startedAt: 0 } } }, 0);
    const { placed, end } = readDisplayList(encoded, 0, 0);
    assert.equal(end, encoded.length);
    const image = blank();
    paintDisplayList(image.pixels, source.pixels, 576, 288, placed, false, elapsedMs);
    return image;
  }
  function scene(name) {
    assert.ok(modes.includes(name), `Unknown v3 mode: ${name}`);
    let band;
    let metadata = {};
    if (name.startsWith('v3-home-')) {
      const empty = name.endsWith('-empty');
      const id = name.slice('v3-home-'.length).replace(/-empty$/, '');
      band = home(id, empty);
      metadata = { card: id, empty, position: cards.findIndex(card => card.id === id) + 1, total: cards.length };
    } else if (/^v3-enter-[0-3]$/.test(name)) {
      const elapsedMs = frameTimes[Number(name.at(-1))];
      band = transition(elapsedMs);
      metadata = { elapsedMs, durationMs, transition: 'clipped slide / production encode-decode-paintDisplayList', direction: 'enter', returnCard: 'calendar', textureBytes, arenaBytes };
    } else if (name === 'v3-app-calendar') {
      band = stock.calendarFunction();
      metadata = { returnCard: 'calendar', confirmExit: false };
    } else if (name === 'v3-more-list') {
      band = moreList();
      metadata = { returnCard: 'more', confirmExit: false };
    } else if (name === 'v3-notification') {
      band = notification();
      metadata = { card: 'calendar', overlay: 'notification' };
    } else {
      band = translateConfirmExit();
      metadata = { returnCard: 'translate', confirmExit: true, reason: 'active recording fixture' };
    }
    const output = blank(640, 480);
    output.bitBlt(band, rect.x, rect.y);
    return { output, name, viewport: rect, font: 'EvenHub firmware 2.3.0.24 / 20 px / pitch 27', art: 'original stock-art.cjs', ...metadata };
  }
  return { scene, home, transition, status };
}

async function* renderV3(context, mode) {
  const scenes = await createV3Scenes(context);
  const selected = mode === 'v3-all' ? modes : mode === 'v3-enter' ? modes.filter(name => name.startsWith(`${mode}-`)) : [mode];
  for (const name of selected) yield scenes.scene(name);
}

module.exports = { cards, modes, frameTimes, textureBytes, arenaBytes, createV3Scenes, renderV3 };
