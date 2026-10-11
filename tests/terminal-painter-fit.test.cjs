const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

const { fitLine, wrapCapped, wrapLines } = loader()('app/graphics/terminal-painter.ts');

const widths = { i: 3, l: 3, ' ': 4, '…': 9, W: 15, m: 13 };
const face = { lineHeight: 27, measureLine: (text) => Array.from(text).reduce((sum, ch) => sum + (widths[ch] ?? 8), 0) };

function slowFit(text, width) {
  const clean = text.replace(/[\r\n\t]/g, ' ');
  if (face.measureLine(clean) <= width) return clean;
  const chars = Array.from(clean);
  while (chars.length && face.measureLine(`${chars.join('').trimEnd()}…`) > width) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

function slowCapped(text, width, max) {
  const lines = wrapLines(face, text, width);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  kept[max - 1] = slowFit(`${kept[max - 1]} ${lines.slice(max).join(' ')}`, width);
  return kept;
}

const samples = ['', 'short', 'Will it fit in the line?', 'WWWW mmmm iiii llll   trailing spaces    here',
  'a\tvery\nlong line that cannot fit anywhere near the width', 'Wmilx'.repeat(40)];

test('binary-search fitLine matches the char-by-char version', () => {
  for (const text of samples) for (const width of [0, 9, 20, 61, 100, 300]) {
    assert.equal(fitLine(face, text, width), slowFit(text, width), `${JSON.stringify(text)} @ ${width}`);
  }
});

test('wrapCapped stops early but keeps the same lines', () => {
  const long = samples.join(' ').repeat(30);
  for (const text of [...samples, long]) for (const [width, max] of [[60, 1], [100, 2], [200, 3], [532, 4]]) {
    assert.deepEqual(wrapCapped(face, text, width, max), slowCapped(text, width, max), `${width}/${max}`);
  }
});
