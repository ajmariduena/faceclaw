const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { createRenderContext } = require('./render.cjs');
const { digit, dotText } = require('./stock-art.cjs');
const { graphics } = createRenderContext();
const canvas = createCanvas(720, 510);
const ctx = canvas.getContext('2d');
GlobalFonts.registerFromPath(path.join(__dirname, '../../app/fonts/ttf/Inter_18pt-Regular.ttf'), 'Labels');
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, 720, 510);
ctx.font = '14px Labels';
ctx.fillStyle = '#aaa';
ctx.fillText('Dígitos propios · escala 1:1 · celda 56×68 · puntos 2×2 / paso 3', 18, 24);
function draw(image, x, y) {
  image = image.withDrawsBaked();
  const data = ctx.createImageData(image.width, image.height);
  for (let i = 0; i < image.pixels.length; i++) {
    const v = graphics.grayToNibble(image.pixels[i]) * 17;
    data.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(data, x, y);
}
for (let n = 0; n < 10; n++) {
  const x = 18 + n * 69;
  ctx.fillText(String(n), x + 23, 50);
  draw(digit(graphics, String(n)), x, 61);
}
const times = ['09/41', '12:54', '07:52', '18:30'];
for (const [index, time] of times.entries()) {
  const x = 18 + index * 178;
  ctx.fillText(time, x, 165);
  const numbers = time.replace(/[:/]/g, '');
  for (let i = 0; i < 4; i++) draw(digit(graphics, numbers[i]), x + (i % 2) * 62, 180 + Math.floor(i / 2) * 80);
}
for (const [index, time] of times.slice(1).entries()) {
  const image = new graphics.GrayImage(268, 68);
  const numbers = time.replace(':', '');
  for (let i = 0; i < 4; i++) image.drawImage(digit(graphics, numbers[i]), i * 62 + (i > 1 ? 18 : 0), 0);
  image.fillRect(125, 20, 5, 5, 255);
  image.fillRect(125, 44, 5, 5, 255);
  if (index === 0) draw(image, 18, 359);
  if (index === 1) draw(image, 370, 359);
  if (index === 2) draw(image, 370, 439);
}
const status = new graphics.GrayImage(300, 20);
dotText(status, 0, 0, 'Mie 07/10');
dotText(status, 165, 0, '24°C');
draw(status, 18, 463);
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const output = path.join(__dirname, 'out/stock-digits.png');
fs.writeFileSync(output, canvas.toBuffer('image/png'));
console.log(output);
