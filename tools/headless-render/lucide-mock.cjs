const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const LUCIDE = process.env.LUCIDE_DIR ?? '/tmp/lucide-pkg/package/icons';
const context = createRenderContext();
const { graphics, adapter, load } = context;
const art = load('app/apps/home/stock-art.ts');

const cards = [
  { name: 'Paseo', status: '2 need you', pixel: 'ai', lucide: 'square-terminal' },
  { name: 'Calendar', status: 'Nothing today', pixel: 'calendar', lucide: 'calendar-days' },
  { name: 'Translate', status: 'Setup required', pixel: 'translate', lucide: 'languages' },
  { name: 'Converse', status: 'Coming soon', pixel: 'people', lucide: 'messages-square' },
  { name: 'More', status: '', pixel: 'more', lucide: 'layout-grid' },
];
const rows = [
  { label: 'AI Chat', pixel: 'ai', lucide: 'sparkles' },
  { label: 'Timers', pixel: 'timer', lucide: 'timer' },
  { label: 'Navigate', pixel: 'navigate', lucide: 'navigation' },
  { label: 'Settings', pixel: 'settings', lucide: 'settings' },
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
}

async function main() {
  const face = await stockFont(graphics);
  const svgs = Object.fromEntries([...cards, ...rows].map((c) => [c.lucide, fs.readFileSync(path.join(LUCIDE, `${c.lucide}.svg`), 'utf8')]));
  await adapter.prepareIcons(Object.values(svgs));
  const icon = (style, item, size, value = 255) => (style === 'lucide'
    ? adapter.rasterizeSvg(svgs[item.lucide], size, 2, graphics.GrayImage)
    : art.icon(graphics, item.pixel, size)).dimmed(value / 255);
  const centered = (image, y, label, value) => face.drawText(image, Math.round((image.width - face.measureLine(label)) / 2), y, label, value);

  for (const style of ['pixel', 'lucide']) {
    // Home strip: the five cards side by side at their real 318×260 size, scaled down in the page.
    cards.forEach((card, i) => {
      const band = new graphics.GrayImage(576, 288);
      const panel = new graphics.GrayImage(318, 260);
      panel.drawRoundedRect(0, 0, 318, 260, 255, 6);
      panel.drawImage(icon(style, card, 48), 135, 54);
      centered(panel, 120, card.name, 255);
      if (card.status) centered(panel, 160, card.status, 153);
      band.bitBlt(panel.withDrawsBaked(), 129, 14);
      save(band, `lucide-${style}-card-${i}`);
    });
    const band = new graphics.GrayImage(576, 288);
    band.drawRoundedRect(4, 4, 568, 280, 255, 8);
    rows.forEach((row, i) => {
      const y = 14 + i * 36;
      if (i === 0) face.drawText(band, 22, y, '>', 255);
      band.drawImage(icon(style, row, 24, i === 0 ? 255 : 170), 48, y + 1);
      face.drawText(band, 86, y, row.label, i === 0 ? 255 : 170);
    });
    band.fillRect(14, 244, 548, 1, 119);
    face.drawText(band, 22, 252, '· More', 119);
    face.drawText(band, 554 - face.measureLine('1/4'), 252, '1/4', 119);
    save(band, `lucide-${style}-more`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
