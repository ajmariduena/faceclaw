const fs = require('node:fs');
const path = require('node:path');
const { createCanvas,loadImage,GlobalFonts } = require('@napi-rs/canvas');
const { modes } = require('./stock-scenes.cjs');
GlobalFonts.registerFromPath(path.join(__dirname,'../../app/fonts/ttf/Inter_18pt-Regular.ttf'),'Labels');
const referenceRoot = process.argv[2] || '/tmp/even-ref';
const outputRoot=path.join(__dirname,'out');
const pairs = {
  'stock-dashboard':['official/dashboard-05-calendar-card.png','Calendario stock; amarillo = anotación del soporte'],
  'stock-dashboard-music':['official/dashboard-01-status-news.png','Mismo marco stock; Música es un widget propio'],
  'stock-dashboard-notifications':['official/dashboard-01-status-news.png','Mismo marco stock; recientes es un widget propio'],
  'stock-widget-expanded':['official/dashboard-06-calendar-expanded.png','Calendario expandido; amarillo = anotación del soporte'],
  'stock-menu':['official/menu-01-notifications-selected.png','Menú stock; distinto orden y margen según versión'],
  'stock-menu-scrolled':['official/menu-06-plugins-576x288.png','Menú stock; distinta selección y contenido'],
  'stock-menu-right':['official/menu-06-plugins-576x288.png','Variante derecha propia frente al menú stock izquierdo'],
  'stock-exit-dialog':['video/dialog-01-lens-end-this-feature.jpg','Diálogo por el lente; escala óptica, no referencia 1:1'],
  'stock-notification':['official/notification-01-whatsapp-popup.png','Notificación stock; contenido ficticio en español'],
};

function fit(ctx,img,x,y,w,h) {
  const scale=Math.min(w/img.width,h/img.height);
  ctx.drawImage(img,x+(w-img.width*scale)/2,y+(h-img.height*scale)/2,img.width*scale,img.height*scale);
}

async function main() {
  const comparisons=[];
  for(const mode of modes) {
    let source,note,crop;
    if(mode.startsWith('stock-menu-open-')) {
      source='video/transition-menu-open-seq.jpg';
      const index=Number(mode.at(-1));
      const cell=[5,6,6,7,8][index];
      crop=[(cell%3)*640+204,Math.floor(cell/3)*360+79,416,212];
      note='Secuencia oficial recortada; fase aproximada, no tiempo exacto';
    } else if(mode.startsWith('stock-open-') && mode!=='stock-open-3') {
      source='video/transition-conversate-open-seq.jpg';
      const cell=mode==='stock-open-0'?0:1;
      crop=[cell*640+98,65,442,227];
      note='Fundido de Conversate como referencia; duración aproximada';
    } else if(mode==='stock-open-3') {
      source='official/dashboard-06-calendar-expanded.png';
      note='Referencia de agenda stock; pantalla de función propia';
    } else [source,note]=pairs[mode];
    const canvas=createCanvas(1184,350),ctx=canvas.getContext('2d');
    ctx.fillStyle='#101010';ctx.fillRect(0,0,1184,350);
    ctx.font='15px Labels';ctx.fillStyle='#eee';
    ctx.fillText(`REFERENCIA · ${path.basename(source)}`,12,21);
    ctx.fillText(`FACECLAW · ${mode}`,604,21);
    ctx.fillStyle='#000';ctx.fillRect(12,32,576,288);ctx.fillRect(604,32,576,288);
    const ref=await loadImage(path.join(referenceRoot,source));
    if(crop) ctx.drawImage(ref,...crop,12,32,576,288);
    else fit(ctx,ref,12,32,576,288);
    const own=await loadImage(path.join(outputRoot,`${mode}.png`));
    ctx.drawImage(own,32,96,576,288,604,32,576,288);
    ctx.fillStyle='#bbb';ctx.font='13px Labels';ctx.fillText(note,12,340);
    const filename=`compare-${mode}.png`;
    fs.writeFileSync(path.join(outputRoot,filename),canvas.toBuffer('image/png'));
    comparisons.push({mode,source,note,filename,canvas});
  }
  for(let page=0;page<3;page++) {
    const canvas=createCanvas(1184,350*6),ctx=canvas.getContext('2d');
    comparisons.slice(page*6,page*6+6).forEach((item,i)=>ctx.drawImage(item.canvas,0,i*350));
    fs.writeFileSync(path.join(outputRoot,`stock-comparisons-${page+1}.png`),canvas.toBuffer('image/png'));
  }
  fs.writeFileSync(path.join(outputRoot,'stock-comparison-manifest.json'),JSON.stringify(comparisons.map(({canvas,...entry})=>entry),null,2));
  console.log(`${comparisons.length} comparisons in ${outputRoot}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
