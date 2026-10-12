// Card stack in the rabbitOS 2 manner, adapted to the G2 band: the home is the
// clock column alone; a scroll raises a deck of cards into the empty right
// half; scrolling expands one card in place while the rest stay as strips.
//   node rabbit-stack.cjs
// Writes out/rs-<name>.png (640x480 grey) and out/rs-<name>-lens.png (576x288 green).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { scenes } = require('./home-column.cjs');

const context = createRenderContext();
const { graphics, adapter, load } = context;
const { paintHomeColumn } = load('app/apps/home/column-painter.ts');
const { homeColumnState, calendarCardState } = load('app/apps/home/home-model.ts');
const { ICON_SVGS } = load('app/graphics/icons.ts');
const art = load('app/apps/home/stock-art.ts');
const outDir = path.join(__dirname, 'out');

const WHITE = 255, DIM = 153, FAINT = 85, FILL = 51;
const STACK_X = 230, STACK_Y = 14, STACK_W = 318, STACK_H = 260;
const STRIP = 32, OVERLAP = 7, RADIUS = 6;

function png(image, file, tint) {
  const rgba = new Uint8Array(image.width * image.height * 4);
  for (let i = 0; i < image.pixels.length; i++) {
    const v = graphics.grayToNibble(image.pixels[i]) * 17;
    rgba.set(tint ? [Math.round(v * 0.45), v, Math.round(v * 0.5), 255] : [v, v, v, 255], i * 4);
  }
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer], image.width, image.height, 0)));
}
function save(band, name) {
  const baked = band.withDrawsBaked();
  const out = new graphics.GrayImage(640, 480);
  out.bitBlt(baked, 32, 96);
  fs.mkdirSync(outDir, { recursive: true });
  png(out, path.join(outDir, `rs-${name}.png`));
  png(baked, path.join(outDir, `rs-${name}-lens.png`), true);
  console.log(`rs-${name}`);
}

async function main() {
  const face = await stockFont(graphics);
  await adapter.prepareIcons(['calendar', 'circle', 'glasses', 'battery', 'cloud-sun', 'square-terminal'].map((n) => ICON_SVGS[n]));
  const data = scenes(new Date(2026, 9, 10, 9, 41), calendarCardState);
  const column = () => paintHomeColumn(homeColumnState(data.now, data.battery, data.weather, data.paseo), face);
  const text = (image, x, y, label, value = WHITE, width = image.width - x) => {
    assert.ok(face.measureLine(label) <= width, `overflow: ${label}`);
    face.drawText(image, x, y, label, value);
  };
  const right = (image, xRight, y, label, value = WHITE) => text(image, xRight - face.measureLine(label), y, label, value);
  const icon = (image, name, x, y, value = WHITE, size = 24) => image.drawImage(art.icon(graphics, name, size).dimmed(value / 255), x, y);

  const CARDS = [
    { icon: 'prompt', name: 'Paseo', lines: [['2 need you', WHITE], ['Fix reconnect after BLE drop', DIM], ['1 working', DIM]] },
    { icon: 'calendar', name: 'Calendar', lines: [['10:30  Daily con el equipo', WHITE], ['14:00  Revisión del plan', DIM], ['Tomorrow 09:00  Dentista', DIM]] },
    { icon: 'translate', name: 'Translate', lines: [['ES / EN', WHITE], ['Ready', DIM]] },
    { icon: 'people', name: 'Converse', lines: [['Live facts · ES/EN', WHITE], ['Coming soon', DIM]] },
    { icon: 'more', name: 'More', lines: [['AI Chat · Timers', WHITE], ['Navigate · Settings', DIM]] },
  ];

  // One card: a rounded outline whose interior is blanked so it occludes the card beneath.
  const paintCard = (image, x, y, h, card, expanded, fill) => {
    image.fillRoundedRect(x, y, STACK_W, h, expanded && fill ? FILL : 0, RADIUS);
    image.drawRoundedRect(x, y, STACK_W, h, expanded ? WHITE : DIM, RADIUS);
    icon(image, card.icon, x + 10, y + 4, expanded ? WHITE : DIM);
    right(image, x + STACK_W - 14, y + 5, card.name, expanded ? WHITE : DIM);
    if (expanded) {
      image.fillRect(x + 10, y + 38, STACK_W - 20, 1, FAINT);
      card.lines.forEach(([line, v], i) => text(image, x + 14, y + 48 + i * 27, line, v, STACK_W - 28));
    }
  };

  /** Expanded card at `selected`; strips above and below, each covering the one under it. */
  const paintStack = (image, selected, { dy = 0, fill = false } = {}) => {
    const expandedH = STACK_H - (CARDS.length - 1) * (STRIP - OVERLAP);
    const tops = [];
    let y = STACK_Y + dy;
    CARDS.forEach((card, i) => {
      const h = i === selected ? expandedH : STRIP;
      tops.push({ y, h, card, expanded: i === selected });
      y += h - OVERLAP;
    });
    // Bottom first so every card hides the top edge of the one below it.
    const clip = new graphics.GrayImage(576, 288);
    for (const t of [...tops].reverse()) paintCard(clip, STACK_X, t.y, t.h, t.card, t.expanded, fill);
    image.bitBlt(clip.withDrawsBaked(), 0, 0, { transparentZero: true });
    for (let i = 0; i < CARDS.length; i++) image.fillRect(218, 120 + i * 11, i === selected ? 4 : 2, 3, i === selected ? WHITE : FAINT);
  };
  const band = () => { const image = new graphics.GrayImage(576, 288); image.bitBlt(column(), 0, 0); return image; };

  // Home: just the column. The right half is the world.
  save(band(), 'home');
  // Scrolling once: the deck rises from below into the empty half (two frames of ~200 ms).
  for (const [k, dy] of [[1, 150], [2, 50]]) { const image = band(); paintStack(image, 0, { dy }); save(image.withDrawsBaked(), `rise-${k}`); }
  // Resting stack with each card expanded.
  for (const [i, name] of [[0, 'paseo'], [1, 'calendar'], [2, 'translate'], [4, 'more']]) { const image = band(); paintStack(image, i); save(image, `stack-${name}`); }
  // The same with a faint fill behind the open card, the closest the band gets to Rabbit's colour.
  { const image = band(); paintStack(image, 1, { fill: true }); save(image, 'stack-calendar-filled'); }

  // A card opened: Rabbit's header (back · time · battery) becomes name · time; the title row keeps the icon.
  const opened = (card) => {
    const image = new graphics.GrayImage(576, 288);
    text(image, 24, 8, '09:41', DIM);
    right(image, 552, 8, 'Sat 10', DIM);
    icon(image, card.icon, 24, 44, WHITE, 24);
    text(image, 58, 44, card.name, WHITE);
    image.fillRect(24, 78, 528, 1, FAINT);
    return image;
  };
  {
    const image = opened(CARDS[1]);
    const rows = [['10:30', 'Daily con el equipo', WHITE, true], ['14:00', 'Revisión del plan de soporte', DIM], ['Tomorrow', '', FAINT], ['09:00', 'Dentista', DIM]];
    let y = 92;
    rows.forEach(([t, title, v, focus]) => {
      if (focus) text(image, 24, y, '>', WHITE);
      text(image, 44, y, t, title ? v : FAINT);
      if (title) text(image, 150, y, title, v, 400);
      y += 27 + (title ? 10 : 0);
    });
    text(image, 44, 240, 'in 49 min', DIM);
    save(image, 'open-calendar');
  }
  {
    const image = opened(CARDS[2]);
    const rows = [['language a', 'Español'], ['language b', 'English'], [null, 'Start']];
    let y = 92;
    rows.forEach(([label, value], i) => {
      if (label) { text(image, 44, y, label, FAINT); y += 22; }
      const on = i === 2;
      if (on) text(image, 24, y, '>', WHITE);
      text(image, 44, y, value, on ? WHITE : DIM);
      if (!on) right(image, 552, y, '>', FAINT);
      y += 27 + 12;
    });
    save(image, 'open-translate');
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
