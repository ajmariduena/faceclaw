const test = require('node:test');
const assert = require('node:assert/strict');
const { createRenderContext } = require('./render.cjs');
const { createScenes,modes,apps,visibleApps,wrapIndex } = require('./stock-scenes.cjs');
const { icon,digit,patterns } = require('./stock-art.cjs');
const context=createRenderContext();
const scenes=createScenes(context);
const quantize=image=>Buffer.from(image.pixels.map(v=>context.graphics.grayToNibble(v)));

function bandRegion(image,x,y,w,h) {
  const data=[];
  for(let j=y;j<y+h;j++) for(let i=x;i<x+w;i++) data.push(image.pixels[j*576+i]);
  return Buffer.from(data);
}

test('all stock scenes have ink only in the 576x288 viewport',async()=>{
  const painter=await scenes;
  for(const name of modes) {
    const {output}=painter.scene(name);
    assert.equal(output.width,640);assert.equal(output.height,480);
    let ink=0;
    for(let y=0;y<480;y++) for(let x=0;x<640;x++) {
      const pixel=output.pixels[y*640+x];
      if(x<32 || x>=608 || y<96 || y>=384) assert.equal(pixel,0,`${name} escaped viewport`);
      else if(pixel) ink++;
    }
    assert.ok(ink>1000,name);
  }
});

test('menu animation starts on dashboard, ends on menu and keeps widget geometry',async()=>{
  const painter=await scenes;
  assert.ok(quantize(painter.menuFrame(0)).equals(quantize(painter.dashboard())), 'Initial frame equals dashboard');
  assert.ok(quantize(painter.menuFrame(500)).equals(quantize(painter.menu())), 'Final frame equals menu');
  const start=bandRegion(painter.dashboard(),230,14,318,260);
  for(const t of [125,250,375,500]) {
    const frame=bandRegion(painter.menuFrame(t),230,14,318,260);
    assert.ok(frame.every((v,i)=>v<=start[i]),`Widget must only dim at ${t}`);
  }
});

test('opening fades monotonically then hands off to Calendar',async()=>{
  const painter=await scenes;
  const frames=[0,1,2,3].map(i=>painter.scene(`stock-open-${i}`).output);
  assert.ok(quantize(frames[0]).equals(quantize(painter.scene('stock-menu-scrolled').output)), 'Fade starts at the selected Calendar');
  for(let i=1;i<3;i++) assert.ok(frames[i].pixels.every((v,j)=>v<=frames[i-1].pixels[j]));
  assert.notDeepEqual(quantize(frames[2]),quantize(frames[3]));
});

test('overlays preserve dimmed dashboard outside their bounds',async()=>{
  const painter=await scenes;
  const dashboard=painter.scene('stock-dashboard').output;
  const notification=painter.scene('stock-notification').output;
  let visible=0;
  for(let y=280;y<370;y++) for(let x=32;x<608;x++) {
    const i=y*640+x;
    assert.ok(notification.pixels[i]<=dashboard.pixels[i]);
    if(notification.pixels[i]) visible++;
  }
  assert.ok(visible>100);
});

test('menu wraps in both directions with five rows and the requested catalogue',()=>{
  assert.equal(apps.length,11);
  assert.equal(apps[wrapIndex(-1)][0],'Más…');
  assert.equal(apps[wrapIndex(11)][0],'Notificaciones');
  assert.deepEqual(visibleApps(6),[5,6,7,8,9]);
  assert.deepEqual(visibleApps(10),[9,10,0,1,2]);
});

test('own pixel icons are binary 24x24 and digits use separated 2x2 dots',()=>{
  for(const name of Object.keys(patterns)) {
    const image=icon(context.graphics,name);
    assert.equal(image.width,24);assert.equal(image.height,24);
    assert.ok(image.pixels.every(v=>v===0||v===255));
  }
  for(const char of '0123456789') {
    const image=digit(context.graphics,char);
    assert.equal(image.width,56);assert.equal(image.height,68);
    for(let y=0;y<68;y++) for(let x=0;x<56;x++) if(x%3===2 || y%3===2) assert.equal(image.pixels[y*56+x],0);
    const filled = new Set();
    for(let y=0;y<23;y++) for(let x=0;x<19;x++) if(image.pixels[y*3*56+x*3]) filled.add(y*19+x);
    const pending = [filled.values().next().value];
    const connected = new Set(pending);
    while(pending.length) {
      const cell = pending.pop();
      const x = cell%19, y = Math.floor(cell/19);
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx=x+dx, ny=y+dy, next=ny*19+nx;
        if(nx>=0 && nx<19 && ny>=0 && ny<23 && filled.has(next) && !connected.has(next)) {
          connected.add(next); pending.push(next);
        }
      }
    }
    assert.equal(connected.size,filled.size,`Digit ${char} has a disconnected stroke`);
    if(char==='1') {
      const columns=[...filled].map(cell=>cell%19);
      assert.ok(Math.abs((Math.min(...columns)+Math.max(...columns))/2-9)<=0.5, '1 must be centered');
    }
  }
});
