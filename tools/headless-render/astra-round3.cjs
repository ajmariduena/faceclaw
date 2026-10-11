// Three local-only proposals. Production GrayImage, stock font and clock painter.
// node tools/headless-render/astra-round3.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { scenes, COLUMN_ICONS } = require('./home-column.cjs');
const { graphics: g, adapter, load } = createRenderContext();
const { paintHomeColumn } = load('app/apps/home/column-painter.ts');
const { homeColumnState, calendarCardState } = load('app/apps/home/home-model.ts');
const { ICON_SVGS, renderIcon } = load('app/graphics/icons.ts');
const art = load('app/apps/home/stock-art.ts');
const out = path.join(__dirname, 'out');
const W = 255, D = 153, F = 85;
const cards = ['Paseo', 'Calendar', 'Translate', 'Converse', 'More'];
const icons = ['prompt', 'calendar', 'translate', 'people', 'more'];
const manifest = [];
function encode(image, file, lens) {
  const rgba = new Uint8Array(image.width * image.height * 4), levels = new Set();
  image.pixels.forEach((p, i) => { const v = g.grayToNibble(p) * 17; levels.add(v); rgba.set(lens ? [Math.round(v*.45),v,Math.round(v*.5),255] : [v,v,v,255],i*4); });
  assert(levels.size <= 16);
  fs.writeFileSync(file, Buffer.from(UPNG.encode([rgba.buffer],image.width,image.height,0)));
}
function save(band, name) {
  band = band.withDrawsBaked();
  assert.equal(band.width,576); assert.equal(band.height,288);
  const canvas = new g.GrayImage(640,480); canvas.bitBlt(band,32,96);
  for (const lens of [false,true]) { const file = `astra-${name}${lens?'-lens':''}.png`; encode(lens?band:canvas,path.join(out,file),lens); manifest.push(file); }
}
async function main() {
  fs.mkdirSync(out,{recursive:true});
  const face = await stockFont(g);
  await adapter.prepareIcons(COLUMN_ICONS.map(n=>ICON_SVGS[n]));
  const data = scenes(new Date(2026,9,10,9,41),calendarCardState);
  const text = (im,x,y,s,v=W,width=576-x) => {
    assert(x>=0 && y>=0 && y+27<=288,`bounds ${s}`);
    assert(face.measureLine(s)<=width,`text overflow ${s}: ${face.measureLine(s)} > ${width}`);
    face.drawText(im,x,y,s,v);
  };
  const pix = (im,n,x,y,v=W) => { assert(v>=153); im.drawImage(art.icon(g,n,24).dimmed(v/255),x,y); };
  const line = (im,x,y,w,v=F) => im.fillRect(x,y,w,1,v);
  // Keep the exact production dot clock and date text position. Enlarge only
  // complication icons to 24px to respect this exploration's hardware brief.
  const column = paintHomeColumn(homeColumnState(data.now,data.battery,data.weather,data.paseo),face);
  column.fillRect(0,0,212,42,0); column.fillRect(0,240,212,48,0);
  pix(column,'calendar',0,12); text(column,25,12,'Sat 10');
  for(const [name,x] of [['circle',112],['glasses',164]]) column.drawImage(renderIcon(name,24),x,12);
  for(const [x,p] of [[138,.72],[188,.88]]) { column.drawImage(renderIcon('battery',24),x,12); column.fillRect(x+5,22,Math.round(p*11),5,W); }
  pix(column,'cloud',0,248); text(column,29,248,'27°'); pix(column,'prompt',165,248); text(column,195,248,'2',W,17);
  const base=()=>{const im=new g.GrayImage(576,288);im.bitBlt(column.withDrawsBaked(),0,0);return im;};
  const dots=(im,s,x=274,y=258)=>{for(let i=0;i<5;i++) im.fillRoundedRect(x+i*17,y,i===s?5:3,3,i===s?W:F,1);};
  const title=(im,s,x=246,y=70)=>{pix(im,icons[s],x,y);text(im,x+34,y,`> ${cards[s]}`);};
  function content(im,s,x,y,width=284) {
    const rows=s===0 ? [['BLE · 1m',D],['¿Corro los tests?',W],['Review · 4m',D],['PR listo para revisar.',W]] : s===1 ? [['10:30 · Today',D],['Daily con el equipo',W],['14:00 · Today',D],['Revisión del plan',W]] : s===2 ? [['ES / EN',W],['Ready',D]] : s===3 ? [['Live facts · ES/EN',W],['Coming soon',D]] : [['AI Chat · Timers',W],['Navigate · Settings',D]];
    rows.forEach(([s,v],i)=>text(im,x,y+i*27,s,v,width));
  }
  // Ventana: invariant registration marks, replacement under a fixed read head.
  const ventana=s=>{const im=base();title(im,s,250,65);for(const y of [104,228]) {line(im,238,y,14,D);line(im,542,y,14,D);} im.fillRect(238,104,1,125,F);content(im,s,254,111,286);dots(im,s,357,252);return im;};
  // Diptico: two simultaneous updates, separated horizontally, no boxes/list.
  const diptico=s=>{const im=base();title(im,s,242,60);line(im,244,102,306);im.fillRect(394,118,1,112,F);
    const columns=s===0 ? [ ['BLE · 1m','¿Corro','los tests?'],['Review · 4m','PR listo','para revisar.'] ] : [ ['10:30','Daily con','el equipo'],['14:00','Revisión','del plan'] ];
    columns.forEach((rows,k)=>rows.forEach((r,i)=>text(im,k?410:244,120+i*27,r,i?W:D,140)));
    text(im,244,224,s===0?'2 updates':'Today',D);dots(im,s,468,258);return im;};
  // Puerto: pictogram stations at the bottom; one ring axis visits them in order.
  const puerto=s=>{const im=base();text(im,242,59,`> ${cards[s]}`);content(im,s,242,101,308);line(im,242,228,308);
    for(let i=0;i<5;i++){const x=247+i*61;pix(im,icons[i],x,244,i===s?W:D);if(i===s)line(im,x-5,276,34,W);im.fillRect(x+10,282,3,3,i===s?W:F);}return im;};
  function opened(s) {
    const im=new g.GrayImage(576,288);im.drawRoundedRect(10,10,556,268,W,6);
    pix(im,icons[s],26,23);text(im,60,22,cards[s]);line(im,26,57,524);
    if(s===1){text(im,28,67,'Today · Sat 10',D);im.drawRoundedRect(24,101,528,61,W,4);text(im,36,105,'> 10:30  Daily con el equipo');text(im,60,132,'Equipo de producto',D);text(im,60,177,'14:00  Revisión del plan');line(im,26,235,524);text(im,28,243,'· Calendar  1/2',D);}
    else {text(im,28,72,'We can review the plan tomorrow.',W);text(im,28,99,'Podemos revisar el plan mañana.',D);line(im,26,235,524);text(im,28,243,'· Translating  ES / EN  0:42',D);}
    return im;
  }
  for(const [name,paint,selected] of [['ventana',ventana,1],['diptico',diptico,1],['puerto',puerto,2]]) {
    save(base(),`${name}-reposo`);save(paint(0),`${name}-primer-scroll`);save(paint(selected),`${name}-navegando`);save(opened(selected),`${name}-abierta`);
  }
  fs.writeFileSync(path.join(out,'astra-manifest.json'),JSON.stringify({band:[576,288],offset:[32,96],font:'stock 20 / 27',files:manifest},null,2)+'\n');
  console.log(manifest.join('\n'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
