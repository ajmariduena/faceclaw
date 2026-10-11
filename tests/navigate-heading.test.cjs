const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');
const { HeadingModel, compassQuality } = loader({ Math, Number, Object })('app/apps/navigate/heading-model.ts');

const diag = (accuracy, anomalies = 0, source = 3, flags = 0x80 | 0x04) => ({ magneticAccuracy: accuracy, magneticAnomalies: anomalies, orientationSource: source, flags, sampleTimeMs: 0 });
const fix = (bearing, speed, bearingAccuracyDeg = 5, accuracyM = 5) => ({ bearing, speed, accuracyM, bearingAccuracyDeg });
const plain = output => ({ ...output, bearingDeg: Math.round(output.bearingDeg) });

test('compass quality follows the CFW diagnostics', () => {
  assert.equal(compassQuality(undefined), 'unknown');
  assert.equal(compassQuality(diag(3)), 'good');
  assert.equal(compassQuality(diag(2, 1)), 'degraded');
  assert.equal(compassQuality(diag(1)), 'degraded');
  assert.equal(compassQuality(diag(0)), 'bad');
  assert.equal(compassQuality(diag(3, 2)), 'bad');
  assert.equal(compassQuality(diag(3, 0, 1, 0x80 | 0x01)), 'bad', 'game rotation vector has no north');
  assert.equal(compassQuality(diag(3, 0, 2, 0x80 | 0x02)), 'good');
  assert.equal(compassQuality(diag(3, 0, 3, 0x04)), 'unknown', 'no matching capture');
});

test('on foot the map follows a good compass, holds briefly when it degrades, then goes north-up and asks for a calibration', () => {
  const m = new HeadingModel(); m.reset('walking');
  m.headSample(90, 'good', 0);
  assert.deepEqual(plain(m.output(0)), { bearingDeg: 90, source: 'head', showChevron: true, compassPoor: false });
  m.courseFix(fix(180, 1.4), 100);
  assert.equal(m.output(100).source, 'head', 'looking sideways while walking keeps the head');
  m.headSample(95, 'degraded', 200);
  assert.equal(m.output(400).source, 'head', 'within the grace period');
  m.headSample(95, 'degraded', 800);
  const held = m.output(900);
  assert.equal(held.source, 'hold'); assert.equal(held.showChevron, false);
  assert.equal(m.output(3_000).source, 'north');
  assert.equal(m.output(5_700).compassPoor, false);
  assert.equal(m.output(5_900).compassPoor, true);
  m.headSample(100, 'good', 6_000);
  assert.equal(m.output(6_500).source, 'north', 'recovery needs sustained good samples');
  m.headSample(100, 'good', 7_600);
  const back = m.output(7_600);
  assert.equal(back.source, 'head'); assert.equal(back.compassPoor, false);
});

test('without a usable compass a steady walking course points the map', () => {
  const m = new HeadingModel(); m.reset('walking');
  for (let t = 0; t <= 2_000; t += 1_000) m.courseFix(fix(45, 1.4), t);
  assert.deepEqual(plain(m.output(2_000)), { bearingDeg: 45, source: 'course', showChevron: true, compassPoor: false });
  m.courseFix(fix(45, 0.3), 2_500);
  assert.equal(m.output(2_600).source, 'course', 'slowing down has hysteresis');
  m.courseFix(fix(45, 0.3), 4_600);
  assert.equal(m.output(4_600).source, 'hold');
});

test('in a vehicle the course needs sustained quality, and a stop holds the frame instead of following the head', () => {
  const m = new HeadingModel(); m.reset('vehicle');
  m.headSample(300, 'good', 0);
  assert.equal(m.output(0).source, 'north', 'the head never drives the map in a car');
  m.courseFix(fix(10, 8), 0); m.courseFix(fix(10, 8), 1_000);
  assert.equal(m.output(1_000).source, 'north', 'two fixes are not enough');
  m.courseFix(fix(10, 8), 2_000);
  assert.equal(m.output(2_000).source, 'course');
  for (let t = 2_500; t <= 4_500; t += 1_000) m.courseFix(fix(10, 0), t);
  const stopped = m.output(4_500);
  assert.equal(stopped.source, 'hold'); assert.equal(stopped.showChevron, false);
  assert.equal(m.output(60_000).source, 'hold', 'a vehicle keeps its frame at a light');
  m.reset('vehicle');
  assert.equal(m.output(60_000).source, 'north', 'a new trip forgets the old frame');
});

test('without bearing accuracy the vehicle course needs more speed, fixes and time', () => {
  const m = new HeadingModel(); m.reset('vehicle');
  for (let t = 0; t <= 3_000; t += 1_000) m.courseFix(fix(200, 6, null), t);
  assert.equal(m.output(3_000).source, 'north');
  m.courseFix(fix(200, 6, null), 4_000);
  assert.equal(m.output(4_000).source, 'course');
});

test('rotation eases along the short arc across north', () => {
  const m = new HeadingModel(); m.reset('walking');
  m.headSample(350, 'good', 0); m.output(0);
  m.headSample(10, 'good', 100);
  const eased = m.output(100).bearingDeg;
  assert.ok(eased > 350 || eased < 10, `took the long way: ${eased}`);
  assert.ok(Math.round(m.output(3_000).bearingDeg) % 360 === 10);
});

test('a calibration in progress or a lost compass stops trusting the old heading', () => {
  const m = new HeadingModel(); m.reset('walking');
  m.headSample(120, 'good', 0); m.output(0);
  m.headLost(100);
  assert.equal(m.output(100).source, 'hold');
  assert.equal(m.output(2_200).source, 'north');
});
