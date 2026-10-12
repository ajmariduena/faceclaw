const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

const { LoudnessTimeline } = loader()('app/native/audio-loudness.ts');

function tone(amplitude, ms) {
  const samples = 16 * ms;
  const pcm = new Uint8Array(samples * 2);
  for (let i = 0; i < samples; i++) {
    const value = i % 2 ? amplitude : -amplitude;
    pcm[2 * i] = value & 0xff;
    pcm[2 * i + 1] = (value >> 8) & 0xff;
  }
  return pcm;
}

test('a token reads the level of the audio under its timestamps', () => {
  const timeline = new LoudnessTimeline();
  timeline.accept(tone(32767, 500));
  timeline.accept(tone(328, 500));
  assert.ok(Math.abs(timeline.loudnessDb(0, 500)) < 0.1, "full scale");
  assert.equal(timeline.loudnessDb(500, 1000), -40);
  assert.equal(timeline.loudnessDb(1000, 1200), undefined, 'not sent yet');
});

test('chunks that split a 10 ms bucket and the 30 s ring', () => {
  const timeline = new LoudnessTimeline();
  const loud = tone(3277, 15);
  timeline.accept(loud.subarray(0, 100));
  timeline.accept(loud.subarray(100));
  assert.equal(timeline.loudnessDb(0, 15), -20);
  for (let i = 0; i < 31; i++) timeline.accept(tone(328, 1000));
  assert.equal(timeline.loudnessDb(0, 15), undefined, 'older than the ring');
  assert.equal(timeline.loudnessDb(30_000, 31_000), -40);
});
