const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

const load = loader({}, { '@nativescript/core': { knownFolders: {}, File: {} } });
const { StockUiFont } = load('app/graphics/stock-ui-font.ts');

// A: 3×2 box, rows "F0 F0" and "0F 00" (stride floor(3/2)+1 = 2); V: inkless. Classes A→V kern -40/16 px.
const bitmap = Buffer.from([0xf0, 0xf0, 0x0f, 0x00]).toString('base64');
const asset = {
  lineHeight: 29,
  baseline: 23,
  glyphs: {
    65: [3, 2, 1, -2, 0, 4, 200, 0, 1, 0],
    86: [0, 0, 0, 0, 4, 0, 190, 0, 0, 1],
    32: [0, 0, 0, 0, 4, 0, 88, -1, 0, 0],
  },
  kerning: [{ rightClasses: 1, values: [-40] }],
  bitmapBase64: bitmap,
};

test('advances round per glyph after class kerning, as LVGL does', () => {
  const font = new StockUiFont(asset);
  assert.equal(font.advanceOf(65), 13); // (200 + 8) >> 4
  assert.equal(font.advanceOf(65, 86), 10); // (200 - 40 + 8) >> 4
  assert.equal(font.advanceOf(86, 65), 12); // V has no left class
  assert.equal(font.advanceOf(65, 32), 13); // space is in no kerning table
  assert.equal(font.measureText('AV A'), 10 + 12 + 6 + 13);
  assert.equal(font.lineHeight, 29);
  assert.equal(font.ascent, 23);
});

test('glyphs decode the firmware nibbles and missing code points draw nothing', () => {
  const font = new StockUiFont(asset);
  const glyph = font.getGlyph(65);
  assert.deepEqual([...glyph.coverage], [15, 0, 15, 0, 15, 0]);
  assert.deepEqual([glyph.bbxX, glyph.bbxY, glyph.dwidthX], [1, -2, 13]);
  assert.equal(font.getGlyph(0x4e2d), undefined);
  assert.equal(font.measureText('中'), 0);
  const drawn = [];
  font.drawText({ drawGlyph: (_font, g, x, y) => drawn.push([g.encoding, x, y]) }, 5, 7, 'A中AV', 255);
  assert.deepEqual(drawn, [[65, 5, 7], [65, 18, 7]]);
});
