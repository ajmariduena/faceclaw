const assert = require('node:assert/strict');
const { stockFont } = require('./stock-font.cjs');
const art = require('./stock-art.cjs');

const apps = [
  ['Notificaciones','bell'], ['Conversar','people'], ['Traducir','translate'],
  ['Teleprompter','prompt'], ['Navegar','navigate'], ['AI Chat','ai'],
  ['Calendario','calendar'], ['Música','music'], ['Timers','timer'],
  ['Ajustes','settings'], ['Más…','more'],
];
const stills = ['stock-dashboard','stock-dashboard-music','stock-dashboard-notifications','stock-widget-expanded','stock-menu','stock-menu-scrolled','stock-menu-right','stock-exit-dialog','stock-notification'];
const modes = [...stills, ...Array.from({length:5},(_,i)=>`stock-menu-open-${i}`), ...Array.from({length:4},(_,i)=>`stock-open-${i}`)];
const events = [
  { title:'Reunión del equipo', place:'Sala Norte', time:'Hoy 10:30 - 11:00' },
  { title:'Revisión de diseño', place:'', time:'Hoy 14:00 - 15:00' },
  { title:'Planificación semanal', place:'Oficina del centro', time:'Mañana 09:30 - 10:30' },
];
const wrapIndex = index => ((index % apps.length) + apps.length) % apps.length;
const visibleApps = selected => Array.from({length:5},(_,i)=>wrapIndex(selected===0 ? i : selected-1+i));

async function createScenes(context) {
  const { graphics, rect, load } = context;
  const face = await stockFont(graphics);
  const blank = (w=576,h=288) => new graphics.GrayImage(w,h);
  const text = (image,x,y,label,value=255,width=576-x,truncate=false) => {
    for(const char of label) assert.ok(char===' ' || face.hasGlyph(char.codePointAt(0)), `Missing firmware glyph ${char}`);
    if(truncate && face.measureLine(label)>width) {
      while(label && face.measureLine(label+'…')>width) label=Array.from(label).slice(0,-1).join('');
      label+='…';
    }
    assert.ok(face.measureLine(label)<=width, `Text overflow: ${label} (${face.measureLine(label)} > ${width})`);
    face.drawText(image,x,y,label,value);
  };
  const icon = (image,name,x,y,value=255,size=24) => image.drawImage(art.icon(graphics,name,size).dimmed(value/255),x,y);
  const dots = (image,x,active=0,count=5) => {
    for(let i=0;i<count;i++) image.fillRect(x,120+i*11,i===active?4:2,3,i===active?255:85);
  };
  const battery = (image,x,y) => {
    image.drawRect(x,y,22,13,255);
    image.fillRect(x+22,y+4,2,5,255);
    for(let i=0;i<4;i++) image.fillRect(x+3+i*4,y+3,2,7,i===3?102:255);
  };
  function status() {
    const image=blank();
    art.dotText(image,22,21,'Mie 07/10');
    battery(image,185,21);
    for(const [value,y] of [['09',69],['41',149]]) {
      for(let i=0;i<2;i++) image.drawImage(art.digit(graphics,value[i]),58+i*62,y);
    }
    icon(image,'cloud',22,248);
    art.dotText(image,52,254,'24°C');
    icon(image,'bell',155,248);
    art.dotText(image,185,254,'3');
    return image.withDrawsBaked();
  }
  function calendarCard(x=230,y=14,w=318,h=260,expanded=false) {
    const image=blank();
    image.drawRoundedRect(x,y,w,h,255,6);
    const content=blank(w-40,h-32);
    const starts=[0,102,174];
    events.forEach((event,i)=>{
      const top=starts[i];
      if(top+27>content.height) return;
      icon(content,'calendar',0,top+3,255,18);
      text(content,26,top,event.title,255,content.width-26,true);
      let line=1;
      if(event.place && top+54<=content.height) {
        icon(content,'pin',0,top+30,153,18);
        text(content,26,top+27,event.place,153,content.width-26,true);
        line++;
      }
      if(top+(line+1)*27<=content.height) {
        icon(content,'clock',0,top+line*27+3,153,18);
        text(content,26,top+line*27,event.time,153,content.width-26,true);
      }
    });
    image.bitBlt(content.withDrawsBaked(),x+20,y+16);
    if(expanded) {
      image.fillRect(x+w-14,y+16,2,h-32,51);
      image.fillRect(x+w-14,y+16,2,104,255);
      dots(image,564,0,4);
    }
    return image.withDrawsBaked();
  }
  function musicCard() {
    const image=blank();
    image.drawRoundedRect(230,14,318,260,255,6);
    icon(image,'music',250,32);
    text(image,282,30,'Sonando',153,244);
    text(image,250,84,'Hasta la raíz',255,278);
    text(image,250,111,'Natalia Lafourcade',153,278);
    text(image,250,138,'Álbum · Hasta la raíz',153,278);
    image.fillRect(250,198,278,2,68);
    image.fillRect(250,198,118,2,255);
    text(image,250,211,'1:42',153,90);
    text(image,483,211,'4:20',153,45);
    image.fillRect(380,246,3,12,255);
    image.fillRect(389,246,3,12,255);
    return image.withDrawsBaked();
  }
  function notificationsCard() {
    const image=blank();
    image.drawRoundedRect(230,14,318,260,255,6);
    for(const [i,[name,title,body]] of [
      ['Mensajes','Lucía · hace 2 min','Nos vemos a las 18:30.'],
      ['Calendario','Reunión del equipo','Empieza en 49 min.'],
    ].entries()) {
      icon(image,i===1?'calendar':'message',250,33+i*108,255,18);
      text(image,276,30+i*108,name,255,252);
      text(image,250,57+i*108,title,153,278,true);
      text(image,250,84+i*108,body,153,278,true);
    }
    return image.withDrawsBaked();
  }
  function dashboard(widget='calendar') {
    const image=status();
    image.bitBlt(widget==='music'?musicCard():widget==='notifications'?notificationsCard():calendarCard(),0,0,{transparentZero:true});
    dots(image,218,widget==='music'?1:widget==='notifications'?2:0);
    return image;
  }
  function menuPanel(selected=0) {
    const image=blank(196,260);
    const indices=visibleApps(selected);
    for(const [slot,index] of indices.entries()) {
      const active=index===selected;
      const y=slot*52;
      if(active) image.fillRoundedRect(1,y+1,194,50,68,5);
      icon(image,apps[index][1],12,y+14,active?255:153);
      text(image,44,y+12,apps[index][0],active?255:153,144);
    }
    image.drawRoundedRect(0,0,196,260,255,6);
    return image.withDrawsBaked();
  }
  function menu(selected=0) {
    const image=calendarCard().dimmed(0.3);
    image.bitBlt(menuPanel(selected),8,14);
    dots(image,212,Math.min(4,Math.floor(selected/3)));
    return image;
  }
  function menuRight() {
    const image=calendarCard(18,64,318,210).dimmed(0.3);
    const header=blank();
    art.dotText(header,22,21,'Mie 07/10');
    art.dotText(header,192,21,'09/41');
    battery(header,300,21);
    art.dotText(header,22,44,'24°C');
    image.bitBlt(header.dimmed(0.3),0,0,{transparentZero:true});
    image.bitBlt(menuPanel(),364,14);
    dots(image,350);
    return image;
  }
  function calendarFunction() {
    const image=blank();
    icon(image,'calendar',22,17);
    text(image,54,14,'Calendario');
    text(image,495,14,'09:41',153,60);
    text(image,22,49,'Hoy · miércoles 7 de octubre',153,520);
    events.forEach((event,i)=>{
      const y=83+i*58;
      text(image,22,y,i===2?'Mañana':'Hoy',153,85);
      text(image,112,y,event.title,255,418,true);
      text(image,112,y+27,[event.time.split(' ').slice(1).join(' '),event.place].filter(Boolean).join(' · '),153,418,true);
    });
    image.fillRect(546,51,2,212,51);
    image.fillRect(546,51,2,106,255);
    return image.withDrawsBaked();
  }
  function exitDialog() {
    const image=calendarFunction().dimmed(0.25);
    image.fillRoundedRect(143,76,290,142,0,6);
    image.drawRoundedRect(143,76,290,142,255,6);
    const title='¿Terminar esta función?';
    text(image,Math.round((576-face.measureLine(title))/2),89,title,255,270);
    text(image,276,134,'No',153,60);
    text(image,262,173,'> Sí',255,75);
    return image.withDrawsBaked();
  }
  function notification() {
    const image=dashboard().dimmed(0.25);
    image.fillRoundedRect(46,28,494,151,0,6);
    image.drawRoundedRect(46,28,494,151,255,6);
    icon(image,'message',62,46);
    text(image,100,43,'Mensajes',255,260);
    const time='hace 2 min';
    text(image,526-face.measureLine(time),43,time,153,140);
    text(image,100,80,'Lucía Andrade',255,426);
    text(image,100,107,'Ya reservé la mesa para las 18:30.',255,426);
    text(image,100,134,'Nos vemos en el café de siempre.',255,426);
    for(let i=0;i<3;i++) image.fillRect(36,91+i*11,3,3,i===0?255:85);
    return image.withDrawsBaked();
  }
  function menuFrame(elapsedMs) {
    if(elapsedMs===0) return dashboard();
    const t=elapsedMs/500;
    const background=calendarCard().dimmed(1-0.7*Math.min(1,t*2));
    if(t<0.5) background.bitBlt(status().dimmed(1-t*2),0,0,{transparentZero:true});
    dots(background,212,0);
    const { DrawExpression:E }=load('app/graphics/draw-expression.ts');
    const { DrawOp,encodeDisplayList,readDisplayList,paintDisplayList }=load('app/graphics/display-list.ts');
    const panel=menuPanel();
    const displayList={
      resources:[{width:panel.width,height:panel.height,pixels:panel.pixels}],
      calls:[{op:DrawOp.RECT_COPY,resource:0,x:0,y:0,width:196,height:260,
        dx:E.progress(500).ease().lerp(E.f32(-196),E.f32(8)).toInt(),dy:14,
        clip:{x:0,y:0,width:210,height:288}}],
      timeline:{token:2,startedAt:0},
    };
    const encoded=encodeDisplayList({displayList,x:0,y:0,width:576,height:288,depth:0},0);
    const {placed,end}=readDisplayList(encoded,0,0);
    assert.equal(end,encoded.length);
    const output=blank();
    output.pixels.set(background.pixels);
    paintDisplayList(output.pixels,background.pixels,576,288,placed,false,elapsedMs);
    if(elapsedMs===500) {
      const expected=menu().pixels;
      assert.ok(output.pixels.every((v,i)=>graphics.grayToNibble(v)===graphics.grayToNibble(expected[i])), 'Menu endpoint must match after 4-bit quantization');
    }
    return output;
  }
  function scene(name) {
    let band, metadata={};
    if(name.startsWith('stock-menu-open-')) {
      const index=Number(name.at(-1));
      band=menuFrame(index*125);
      metadata={elapsedMs:index*125,durationMs:500,renderer:'production display list slide; raster dimming',easing:'smoothstep (inferred)'};
    } else if(name.startsWith('stock-open-')) {
      const index=Number(name.at(-1));
      band=index===3?calendarFunction():menu(6).dimmed([1,0.65,0.3][index]);
      metadata={elapsedMs:index*100,durationMs:300,renderer:'production GrayImage dimmed; sampled fade, no alpha display-list op'};
    } else {
      const painters={
        'stock-dashboard':()=>dashboard(), 'stock-dashboard-music':()=>dashboard('music'),
        'stock-dashboard-notifications':()=>dashboard('notifications'),
        'stock-widget-expanded':()=>calendarCard(18,14,540,260,true),
        'stock-menu':()=>menu(), 'stock-menu-scrolled':()=>menu(6),
        'stock-menu-right':menuRight, 'stock-exit-dialog':exitDialog, 'stock-notification':notification,
      };
      assert.ok(painters[name],`Unknown stock mode ${name}`);
      band=painters[name]();
    }
    const output=blank(640,480);
    output.bitBlt(band,rect.x,rect.y);
    return {output,name,viewport:rect,font:'EvenHub firmware 2.3.0.24 / 20 px / pitch 27',art:'original procedural dot-matrix and ASCII pixel icons',...metadata};
  }
  return { scene, menu, dashboard, calendarFunction, menuFrame, face };
}

async function renderStock(context,mode) {
  const scenes=await createScenes(context);
  return (mode==='stock-all'?modes:mode==='stock-menu-open'?modes.filter(x=>x.startsWith('stock-menu-open-')):mode==='stock-open'?modes.filter(x=>x.startsWith('stock-open-')):[mode]).map(scenes.scene);
}

module.exports={renderStock,createScenes,modes,apps,visibleApps,wrapIndex};
