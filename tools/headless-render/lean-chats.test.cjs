const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UPNG = require('upng-js');
const { createRenderContext } = require('./render.cjs');
const { stockFont } = require('./stock-font.cjs');
const { graphics, load } = createRenderContext();
const { paintChat } = load('app/graphics/terminal-painter.ts');
const scenes = [
  ['ai-ready', [], { left: '· AI Chat', right: 'gpt-oss-120b' }],
  ['ai-answer', [{ role: 'user', text: 'Pon un timer de diez minutos.' }, { role: 'assistant', text: '> Timer · 10 min', action: true }, { role: 'assistant', text: 'Listo. Te aviso en diez minutos.' }], { left: '· AI Chat', right: 'gpt-oss-120b' }],
  ['ai-listening', [{ role: 'assistant', text: 'Listo. Te aviso en diez minutos.' }, { role: 'user', text: 'Mejor que sean quince minutos', live: true }], { left: '· Listening', right: '0:03' }],
  ['ai-thinking', [{ role: 'user', text: '¿Cuándo es mi siguiente reunión?' }], { left: '· Thinking', right: '1.4s' }],
  ['ai-draft', [{ role: 'assistant', text: 'Listo. Te aviso en diez minutos.' }, { role: 'user', text: 'Mejor que sean quince minutos', live: true }], null, { question: 'Draft', options: ['Send', 'Edit', 'Discard'], selected: 0 }],
  ['paseo-draft', [{ role: 'assistant', text: 'Terminé el cambio; pasan las pruebas.' }, { role: 'user', text: 'Revisa también la reconexión de Bluetooth.', live: true }], null, { question: 'Draft', options: ['Send', 'Edit', 'Discard'], selected: 1 }],
  ['paseo-edit', [{ role: 'user', text: 'Revisa también la reconexión de Bluetooth.', live: true }], null, { question: 'Edit on phone', options: ['Send', 'Edit', 'Discard'], selected: 1 }],
];
test('shared production terminal chats: stock font, alignment, bounds, drafts and quiet actions', async () => {
  const font = await stockFont(graphics);
  for (const [name, lines, footer, permission = null] of scenes) {
    const draws = [];
    const face = { lineHeight: font.lineHeight, measureLine: t => font.measureLine(t), drawText(image, x, y, text, value) {
      draws.push({ x, y, text, value }); font.drawText(image, x, y, text, value);
    } };
    const band = new graphics.GrayImage(576, 288);
    paintChat(band, face, { lines, footer, permission, scrollBack: 0, message: 'Ready' });
    for (const draw of draws) {
      assert.ok(draw.x >= 14 && draw.x + face.measureLine(draw.text) <= 562, `${name}: horizontal bounds ${draw.text}`);
      assert.ok(draw.y >= 8 && draw.y + 27 <= 284, `${name}: vertical bounds ${draw.text}`);
      assert.ok(!/tap|hold|swipe/i.test(draw.text), `${name}: gesture hint`);
      for (const char of draw.text) assert.ok(font.hasGlyph(char.codePointAt(0)), `missing glyph ${char}`);
    }
    if (permission) {
      assert.ok(draws.some(d => d.text === '>' && d.value === 255));
      for (const label of permission.options) assert.ok(draws.some(d => d.text === label));
    }
    const action = draws.find(d => d.text === '> Timer · 10 min');
    if (action) assert.equal(action.value, 120);
    const currentUser = lines.at(-1);
    if (currentUser?.role === 'user' && face.measureLine(currentUser.text) <= 468) {
      const draw = draws.find(d => d.text === currentUser.text);
      assert.ok(draw); assert.equal(draw.x + face.measureLine(draw.text), 554);
    }
    const baked = band.withDrawsBaked();
    const rgba = new Uint8Array(576 * 288 * 4);
    for (let i = 0; i < baked.pixels.length; i++) { const value = graphics.grayToNibble(baked.pixels[i]) * 17; rgba.set([value, value, value, 255], i * 4); }
    fs.writeFileSync(path.join(__dirname, 'out', `lean-${name}.png`), Buffer.from(UPNG.encode([rgba.buffer], 576, 288, 0)));
  }
});
