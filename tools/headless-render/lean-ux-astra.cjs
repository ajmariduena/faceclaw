// Design evidence only. Run: node lean-ux-astra.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

async function main() {
  const { graphics } = createRenderContext();
  const face = await stockFont(graphics);
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const pitch = 27;
  function text(img, x, y, label, value = 255, width = 532) {
    assert.ok(face.measureLine(label) <= width, `Text overflow: ${label}`);
    assert.ok(x >= 4 && x + face.measureLine(label) <= 572);
    assert.ok(y >= 4 && y + pitch <= 284);
    face.drawText(img, x, y, label, value);
  }
  function frame(title, footer) {
    const img = new graphics.GrayImage(576, 288);
    img.drawRoundedRect(4, 4, 568, 280, 255, 8);
    text(img, 22, 17, title);
    img.fillRect(14, 244, 548, 1, 119);
    text(img, 22, 252, footer, 153);
    return img;
  }
  function png(img) {
    const baked = img.withDrawsBaked();
    const rgba = new Uint8Array(baked.width * baked.height * 4);
    for (let i = 0; i < baked.pixels.length; i++) {
      const v = graphics.grayToNibble(baked.pixels[i]) * 17;
      assert.ok(v >= 0 && v <= 255 && v % 17 === 0);
      rgba.set([v, v, v, 255], i * 4);
    }
    return Buffer.from(UPNG.encode([rgba.buffer], baked.width, baked.height, 0));
  }
  const more = frame('More', '2 apps');
  more.drawRoundedRect(18, 63, 540, 81, 119, 6);
  text(more, 32, 74, '> AI Chat');
  text(more, 32, 101, '  Settings', 153);

  const leave = frame('Converse', 'Listening  02:14');
  text(leave, 22, 56, 'La independencia fue el 9 de octubre.', 153);
  text(leave, 22, 83, 'Source: archivo municipal', 119);
  text(leave, 22, 119, 'Stop and leave?');
  leave.drawRoundedRect(18, 157, 540, 76, 119, 6);
  text(leave, 32, 165, '> Keep listening');
  text(leave, 32, 192, '  Stop and leave', 153);

  const scenes = [
    ['lean-ux-astra-more', 'More: solo AI Chat y Settings', more],
    ['lean-ux-astra-leave', 'Converse: salida sin ocultar la captura', leave],
  ];
  const figures = scenes.map(([name, title, band]) => {
    const screen = new graphics.GrayImage(640, 480);
    screen.bitBlt(band.withDrawsBaked(), 32, 96);
    const output = path.join(outDir, `${name}.png`);
    fs.writeFileSync(output, png(screen));
    console.log(output);
    return `<figure><figcaption>${title}</figcaption><img width="576" height="288" alt="${title}. Propuesta headless con fuente stock." src="data:image/png;base64,${png(band).toString('base64')}"></figure>`;
  });
  const fragment = `<style>#lean-ux-astra figure{margin:0 0 16px}#lean-ux-astra img{display:block;max-width:100%;height:auto}#lean-ux-astra figcaption{margin-bottom:8px}</style>\n<div id="lean-ux-astra">${figures.join('\n')}</div>\n`;
  assert.ok(Buffer.byteLength(fragment) < 1000000);
  fs.writeFileSync(path.join(outDir, 'lean-ux-astra.html'), fragment);
  console.log('2 renders; text bounds and 16-level grayscale checked.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
