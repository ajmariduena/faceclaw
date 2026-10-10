const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');

const assert = require('node:assert/strict');
const frames = [];
const context = createRenderContext();
const { graphics, TtfFont, adapter, load } = context;
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
  frames.push({name, rgba}); console.log(name);
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

function fit(face, label, width = 278) {
  if (face.measureLine(label) <= width) return label;
  const chars = Array.from(label);
  while (chars.length && face.measureLine(chars.join('') + '…') > width) chars.pop();
  return chars.join('').trimEnd() + '…';
}
function wrap(face, label, count = 2) {
  const words = label.split(/\s+/), lines = [];
  while (words.length && lines.length < count) {
    if (lines.length === count - 1) { lines.push(fit(face, words.join(' '))); break; }
    let line = words.shift();
    while (words.length && face.measureLine(line + ' ' + words[0]) <= 278) line += ' ' + words.shift();
    lines.push(fit(face, line));
  }
  return lines;
}
function render(layout, state, face, large, svgIcon) {
  const image = new graphics.GrayImage(576, 288);
  column(image, {day:'Sat 10', hh:'09', mm:'41', ring:3, glasses:4, temp:'27°C', needs:state === 'needs' ? 1 : 0}, svgIcon);
  if (state === 'offline') { image.fillRect(180, 250, 25, 27, 0); image.fillRect(181, 260, 9, 2, 136); }
  for (let i=0;i<5;i++) image.fillRect(218,120+i*11,i ? 2:4,3,i ? 85:255);
  const panel = new graphics.GrayImage(318,260), boxes = [], pitch = large ? 34 : 27;
  panel.drawRoundedRect(0,0,318,260,255,6);
  const text = (y,label,shade=255) => {
    label = fit(face,label);
    assert.ok(face.measureLine(label)<=278 && y>=12 && y+pitch<=250, `bounds: ${label}`);
    for (const b of boxes) assert.ok(y>=b+pitch || b>=y+pitch, `overlap: ${label}`);
    boxes.push(y); face.drawText(panel,20,y,label,shade);
  };
  text(16,'Paseo',136);
  const footer = large ? 214 : 222;
  if (state === 'offline') {
    text(large ? 66:75,'Mac unreachable'); text(large ? 112:120,'Status unknown',136);
    text(footer,'Last seen 8 min ago',136);
  } else if (layout === 'decision') {
    text(62,state === 'needs' ? '1 needs you' : state === 'working' ? 'No action needed' : 'All clear');
    if (state === 'needs') {
      if (!large) text(98,'Reconectar Bluetooth',136);
      wrap(face,'¿Apruebas correr los tests de BLE?').forEach((s,i)=>text((large ? 106:133)+i*pitch,s));
      text(footer,'2 working · 3 done',136);
    } else if (state === 'working') {
      text(large ? 111:119,'2 working');
      if (!large) text(154,'Revisar PR · Ajustar voz',136);
      text(footer,'0 done in last hour',136);
    } else {
      text(large ? 111:119,'3 done in last hour');
      if (!large) text(154,'Reconexión BLE lista',136);
      text(footer,'Nothing running',136);
    }
  } else {
    const ys=large ? [61,95,129]:[64,91,118];
    text(ys[0],state === 'needs' ? '1 needs you':'0 need you',state === 'needs' ? 255:136);
    text(ys[1],state === 'quiet' ? '0 working':'2 working',state === 'quiet' ? 136:255);
    text(ys[2],state === 'working' ? '0 done · last hour':'3 done · last hour',state === 'quiet' ? 255:136);
    if(state === 'needs') wrap(face,'¿Apruebas correr los tests de BLE?').forEach((s,i)=>text((large ? 180:181)+i*pitch,s));
    else text(footer,state === 'quiet' ? 'All clear':'No action needed',136);
  }
  image.bitBlt(panel.withDrawsBaked(),230,14);
  save(image,`paseo-card-astra-${layout}-${state}-${large ? '26':'20'}`);
}
async function main() {
  const face=await stockFont(graphics), ttf=TtfFont.load(adapter.fontPath,26);
  const large={measureLine:s=>ttf.measureText(s),drawText:(...a)=>ttf.drawText(...a)};
  await adapter.prepareIcons(['cloud-sun','square-terminal'].map(n=>ICON_SVGS[n]));
  const svgIcon=(n,s)=>adapter.rasterizeSvg(ICON_SVGS[n],s,2,graphics.GrayImage);
  for(const layout of ['decision','ledger']) for(const [font,big] of [[face,false],[large,true]])
    for(const state of ['needs','working','quiet','offline']) render(layout,state,font,big,svgIcon);
  const w=576*4,h=288*4,sheet=new Uint8Array(w*h*4);
  frames.forEach(({rgba},i)=>{
    const dx=i%4*576,dy=Math.floor(i/4)*288;
    for(let y=0;y<288;y++) sheet.set(rgba.subarray(((y+96)*640+32)*4,((y+96)*640+608)*4),((dy+y)*w+dx)*4);
  });
  fs.writeFileSync(path.join(__dirname,'out/paseo-card-astra-sheet.png'),Buffer.from(UPNG.encode([sheet.buffer],w,h,0)));
  console.log('16 renders: measured text bounds and row collisions passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
