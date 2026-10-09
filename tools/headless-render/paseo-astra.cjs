/** Static proposals. No device/daemon side effects.
 * Scroll selects agents/actions or reading pages; tap activates selection.
 * Double tap goes back; tap-then-hold opens Deny/Stop/Archive/Reply by voice.
 * Watch L/R: Inbox groups, Focus agents, Glance home cards.
 * HUD tap opens detail, never approves. Voice: Spanish, review before Send.
 * Detail scroll includes Full reply and Reply by voice; reading tap is inert.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRenderContext}=require('./render.cjs');
const {createScenes}=require('./stock-scenes.cjs');
const UPNG=require('upng-js');
const source=fs.readFileSync(path.join(__dirname,'paseo-scenes.cjs'),'utf8');
const fixture={};
vm.runInNewContext(source.slice(source.indexOf('const NOW'),source.indexOf('function main()'))+'\nthis.data={agents,fullReply,NOW};',fixture);
const agents=fixture.data.agents.filter(a=>!a.section);
const reply=fixture.data.fullReply.find(a=>a.kind==='assistant').text;
const command=fixture.data.fullReply.find(a=>a.kind==='request').detail;
const summary='Arreglé la reconexión tras una caída de BLE; ¿apruebas correr los tests?';
const outDir=path.join(__dirname,'out');
const files=[];
async function main(){
 const context=createRenderContext();
 const {graphics,TtfFont,adapter,rect}=context;
 const {face}=await createScenes(context);
 const large=TtfFont.load(adapter.fontPath,28),clock=TtfFont.load(adapter.fontPath,42);
 const {Menu}=context.load('app/ui/menu-core.ts');
 assert.equal(face.lineHeight,27);
 const blank=()=>new graphics.GrayImage(576,288);
 const widthOf=(f,s)=>f.measureLine?f.measureLine(s):f.measureText(s);
 const bounds=new WeakMap();
 function text(im,x,y,s,max=540,shade=255,font=face){
  const w=Math.ceil(widthOf(font,s));
  assert.ok(w<=max,`Text overflow ${w}/${max}: ${s}`);
  assert.ok(x>=0&&y>=0&&x+w<=im.width&&y+font.lineHeight<=im.height,`Outside image: ${s}`);
  if(font===face)for(const c of s)assert.ok(c===' '||face.hasGlyph(c.codePointAt(0)),`Missing glyph ${c}`);
  const prev=bounds.get(im)||[];
  for(const p of prev)assert.ok(x>=p.x+p.w||x+w<=p.x||y>=p.y+p.h||y+font.lineHeight<=p.y,`Collision: ${s} / ${p.s}`);
  prev.push({x,y,w,h:font.lineHeight,s});bounds.set(im,prev);
  font.drawText(im,x,y,s,shade);
 }
 function right(im,y,s,shade=187,end=556){text(im,Math.floor(end-widthOf(face,s)),y,s,540,shade);}
 function wrap(s,w,font=face){
  const lines=[];let line='';
  for(const word of s.trim().split(/\s+/)){
   assert.ok(widthOf(font,word)<=w,`Unbreakable word ${word}`);
   const next=line?`${line} ${word}`:word;
   if(widthOf(font,next)>w){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);
  if(lines.length>1&&lines.at(-1).split(' ').length===1){
   const previous=lines.at(-2).split(' ');
   while(previous.length>1&&lines.at(-1).split(' ').length<3){
    const next=previous.at(-1)+' '+lines.at(-1);if(widthOf(font,next)>w)break;
    previous.pop();lines[lines.length-1]=next;
   }
   lines[lines.length-2]=previous.join(' ');
  }
  assert.equal(lines.join(' '),s.trim().replace(/\s+/g,' '));return lines;
 }
 function block(im,x,y,s,w,max,shade=255,font=face,pitch=27){
  const lines=wrap(s,w,font);assert.ok(lines.length<=max,`Too many lines ${lines.length}/${max}: ${s}`);assert.ok(pitch>=font.lineHeight);
  lines.forEach((l,i)=>text(im,x,y+i*pitch,l,w,shade,font));return lines.length*pitch;
 }
 function border(im,x,y,w,h,shade=221){assert.ok(x>=0&&y>=0&&x+w<=im.width&&y+h<=im.height);im.drawRoundedRect(x,y,w,h,shade,6);}
 const age=a=>a.at===fixture.data.NOW?'Now':`${Math.round((fixture.data.NOW-a.at)/60000)}m`;
 const group=a=>['approval','input'].includes(a.status)?'Needs you':a.status==='working'?'Working':'Recent';
 const action=a=>({approval:'Approve',input:'Reply',working:'Working',ready:'Finished',failed:'Failed'})[a.status];
 function footer(im,left,r){text(im,20,254,left,350,187);if(r)right(im,254,r);}
 function save(im,direction,screen){
  const output=new graphics.GrayImage(640,480);output.bitBlt(im.withDrawsBaked(),rect.x,rect.y);
  const rgba=new Uint8Array(640*480*4),levels=new Set();
  for(let i=0;i<output.pixels.length;i++){
   const v=graphics.grayToNibble(output.pixels[i])*17;levels.add(v);const x=i%640,y=Math.floor(i/640);
   if(x<32||x>=608||y<96||y>=384)assert.equal(v,0,'Ink outside band');rgba.set([v,v,v,255],i*4);
  }
  assert.ok(levels.size<=16);const name=`paseo-astra-${direction}-${screen}.png`;
  fs.writeFileSync(path.join(outDir,name),Buffer.from(UPNG.encode([rgba.buffer],640,480,0)));
  files.push({direction,screen,name,textBoxes:bounds.get(im)?.length||0});
 }
 function inboxList(section='Needs you'){
  const im=blank();text(im,20,6,'Paseo',100);right(im,6,`${section} · ${agents.filter(a=>group(a)===section).length}`,255);
  const items=agents.filter(a=>group(a)===section);
  const menu=new Menu({items,selectedIndex:0,wrap:false,highlight:false,getHeight:()=>98,
   draw:({image,item,x,y,width,selected})=>{
    if(selected)border(image,x,y,width,92);
    text(image,x+14,y+5,item.title,width-28,selected?255:221);
    block(image,x+14,y+34,item.summary,width-28,2,selected?255:187);
   }});
  menu.paint(im,{x:8,y:43,width:552,height:196},true);
  footer(im,section==='Needs you'?'Tap: review':'Tap: open',section==='Needs you'?'1 working · 2 recent':'Scroll: select');return im;
 }
 function focusList(a,i){
  const im=blank();text(im,20,6,`Paseo · ${group(a)}`,320);right(im,6,`${i+1} / 5`);
  text(im,20,49,a.title,536);text(im,20,80,`${a.project} · ${age(a)} · ${action(a)}`,536,187);
  block(im,20,125,a.summary,536,3,255,large,34);footer(im,'Scroll: next agent','Tap: open');return im;
 }
 function glanceList(a,i){
  const im=blank();text(im,12,9,'08:40',148,255,clock);text(im,14,70,'Paseo',142,221);
  text(im,14,112,'2 need you',142);text(im,14,146,'1 working',142,187);text(im,14,180,'2 recent',142,187);text(im,14,250,`${i+1} / 5`,142,187);
  border(im,172,8,392,270);text(im,190,20,action(a),352,221);block(im,190,57,a.title,352,2);
  block(im,190,126,a.summary,352,3,221);text(im,190,239,'Tap: open',352);return im;
 }
 function detail(direction){
  const im=blank();
  if(direction==='inbox'){
   text(im,20,5,agents[0].title,536);text(im,20,36,'faceclaw · Needs approval',536,187);
   block(im,20,78,summary,536,2);text(im,20,145,command,536,221);
   border(im,10,192,550,42);text(im,26,199,'Approve command',500);footer(im,'Scroll: full reply','Tap: approve');
  }else if(direction==='focus'){
   text(im,20,5,'Needs approval',300);right(im,5,'faceclaw');text(im,20,39,agents[0].title,536,187);
   block(im,20,82,summary,536,3,255,large,34);text(im,20,174,command,536,221);text(im,20,208,'Scroll: full reply / voice reply',536,187);
   border(im,10,239,550,43);text(im,25,245,'Approve',200);right(im,245,'Tap to confirm',221,540);
  }else{
   text(im,18,8,'Approval',145);text(im,18,48,'faceclaw',145,187);text(im,18,105,'Scroll:',145,187);text(im,18,132,'Read / reply',145,221);text(im,18,192,'1 of 2',145,187);text(im,18,245,'Needs you',145,221);
   border(im,172,8,392,270);block(im,190,19,agents[0].title,352,2,187);block(im,190,86,summary,352,3);
   text(im,190,184,command,352,221);border(im,184,230,368,38);text(im,200,235,'Tap: approve',330);
  }return im;
 }
 function full(direction){
  const left=direction==='glance'?68:20,w=direction==='glance'?488:532;
  // Markdown code delimiters are formatting, not spoken/readable content.
  const plainReply=reply.replace(/`/g,'');
  const lines=wrap(plainReply,w),size=7,pages=Math.ceil(lines.length/size);assert.equal(lines.join(' '),plainReply);
  for(let page=0;page<pages;page++){
   const im=blank();text(im,20,5,direction==='focus'?'Full reply · faceclaw':agents[0].title,420,221);right(im,5,`${page+1} / ${pages}`);
   if(direction==='glance')for(let i=0;i<pages;i++)im.fillRoundedRect(24,72+i*24,i===page?8:4,4,i===page?255:119,2);
   lines.slice(page*size,(page+1)*size).forEach((l,i)=>text(im,left,46+i*27,l,w));
   footer(im,page===pages-1?'End of reply':'Scroll: next page','Double tap: back');save(im,direction,page===0?'full':`full-${page+1}`);
  }
 }
 function hud(direction,finished=false){
  const im=blank(),a=finished?agents[3]:agents[0],label=finished?'Finished':'Needs approval';
  if(direction==='glance')text(im,14,8,'08:40',150,68,clock);
  const y=direction==='inbox'?26:direction==='focus'?72:82,h=176;
  if(direction!=='focus')border(im,10,y,554,h);
  text(im,28,y+8,`Paseo · ${label}`,390);right(im,y+8,'Now',187,544);text(im,28,y+43,a.title,518,221);
  block(im,28,y+81,a.summary,518,2);text(im,28,y+h-38,'Tap: open',240,221);right(im,y+h-38,'Double tap: dismiss',187,544);return im;
 }
 fs.mkdirSync(outDir,{recursive:true});
 for(const d of ['inbox','focus','glance']){
  if(d==='inbox')for(const section of ['Needs you','Working','Recent'])save(inboxList(section),d,section==='Needs you'?'list':`list-${section.toLowerCase()}`);
  else agents.forEach((a,i)=>save(d==='focus'?focusList(a,i):glanceList(a,i),d,i===0?'list':`list-${i+1}`));
  save(detail(d),d,'detail');full(d);save(hud(d),d,'hud');save(hud(d,true),d,'hud-finished');
 }
 assert.ok(summary.split(/\s+/).length<=25);for(const a of agents)assert.ok(a.summary.split(/\s+/).length<=25);
 fs.writeFileSync(path.join(outDir,'paseo-astra-manifest.json'),JSON.stringify({viewport:rect,grayLevels:16,font:'Even stock 20px / pitch 27',summaryWords:summary.split(/\s+/).length,files},null,2));
 console.log(`Rendered ${files.length} PNGs; text bounds, collisions, glyphs, full reply, band and grayscale asserted.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
