const test = require('node:test');
const assert = require('node:assert/strict');
const { createRenderContext } = require('./render.cjs');
const { createScenes: createStockScenes } = require('./stock-scenes.cjs');
const { cards, modes, createV3Scenes, textureBytes, arenaBytes } = require('./v3-scenes.cjs');
const context = createRenderContext();
const scenes = createV3Scenes(context);
const quantized = image => Buffer.from(image.pixels.map(context.graphics.grayToNibble));
const band = output => {
  const result = new context.graphics.GrayImage(576, 288);
  for (let y = 0; y < 288; y++) result.pixels.set(output.pixels.subarray((y + 96) * 640 + 32, (y + 96) * 640 + 608), y * 576);
  return result;
};

test('v3 fixes five cards in order and empty states keep their position', async () => {
  assert.deepEqual(cards.map(card => card.id), ['calendar', 'music', 'notifications', 'translate', 'more']);
  assert.equal(modes.length, 14);
  const painter = await scenes;
  for (const [index, card] of cards.entries()) {
    const home = painter.home(card.id);
    for (let i = 0; i < 5; i++) assert.equal(home.pixels[(120 + i * 11) * 576 + 218], i === index ? 255 : 85);
  }
  for (const id of ['calendar', 'music', 'notifications']) {
    const filled = painter.home(id), empty = painter.home(id, true);
    let differences = 0;
    for (let y = 0; y < 288; y++) for (let x = 0; x < 576; x++) {
      const index = y * 576 + x;
      if (x < 230 || x >= 548 || y < 14 || y >= 274) assert.equal(empty.pixels[index], filled.pixels[index]);
      else if (empty.pixels[index] !== filled.pixels[index]) differences++;
    }
    assert.ok(differences > 100);
  }
});

test('all v3 frames stay inside the physical viewport', async () => {
  const painter = await scenes;
  for (const name of modes) {
    const { output } = painter.scene(name);
    assert.equal(output.width, 640); assert.equal(output.height, 480);
    assert.ok(output.pixels.some(value => value > 0));
    for (let y = 0; y < 480; y++) for (let x = 0; x < 640; x++) {
      if (x < 32 || x >= 608 || y < 96 || y >= 384) assert.equal(output.pixels[y * 640 + x], 0, name);
    }
  }
});

test('v3 keeps the stock clock column byte-for-byte', async () => {
  const painter = await scenes;
  const stock = await createStockScenes(context);
  const reference = stock.dashboard();
  for (const card of cards) {
    const image = painter.home(card.id);
    for (let y = 0; y < 288; y++) for (let x = 0; x < 212; x++) assert.equal(image.pixels[y * 576 + x], reference.pixels[y * 576 + x]);
  }
});

test('clipped slide endpoints and inverse return match with bounded textures', async () => {
  const painter = await scenes;
  const home = painter.home(), app = band(painter.scene('v3-app-calendar').output);
  for (const [elapsed, returning, expected] of [[0, false, home], [200, false, app], [0, true, app], [200, true, home]]) {
    assert.ok(quantized(painter.transition(elapsed, returning)).equals(quantized(expected)), `${elapsed}/${returning}`);
  }
  assert.equal(textureBytes, 82954);
  assert.ok(textureBytes / 2 < 65536);
  assert.ok(textureBytes + 32 < arenaBytes);
  assert.ok(textureBytes * 2 + 64 < arenaBytes);
});

test('notification leaves dimmed home visible and only recording gets exit confirmation', async () => {
  const painter = await scenes;
  const home = painter.home(), overlay = band(painter.scene('v3-notification').output);
  let visible = 0;
  for (let y = 180; y < 288; y++) for (let x = 0; x < 576; x++) {
    const index = y * 576 + x;
    assert.ok(overlay.pixels[index] <= home.pixels[index]);
    if (overlay.pixels[index]) visible++;
  }
  assert.ok(visible > 100);
  assert.equal(painter.scene('v3-app-calendar').confirmExit, false);
  assert.equal(painter.scene('v3-more-list').confirmExit, false);
  assert.equal(painter.scene('v3-translate-confirm-exit').confirmExit, true);
});
