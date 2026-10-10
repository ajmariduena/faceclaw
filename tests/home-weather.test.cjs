const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');
const { HomeWeather, openMeteoUrl, parseOpenMeteo, weatherIcon, weatherLabel, HOME_WEATHER_REFRESH_MS, HOME_WEATHER_RETRY_MS, HOME_WEATHER_STALE_MS } =
  loader({ setTimeout, clearTimeout })('app/apps/home/home-weather.ts');

// The body api.open-meteo.com returned for Guayaquil on 2026-10-10 (trimmed).
const LIVE = { latitude: -2.1441126, longitude: -79.95215, utc_offset_seconds: -18000, timezone: 'America/Guayaquil',
  current_units: { time: 'iso8601', interval: 'seconds', temperature_2m: '°C', weather_code: 'wmo code', is_day: '' },
  current: { time: '2026-10-10T10:45', interval: 900, temperature_2m: 30.3, weather_code: 3, is_day: 1 } };
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };

function fake({ permitted = true, body = LIVE, fail = false, cache = new Map() } = {}) {
  const calls = { locate: 0, fetch: 0, urls: [], changes: 0 };
  let nowMs = new Date(2026, 9, 10, 9, 41).getTime();
  const deps = {
    permitted: () => permitted,
    locate: async () => { calls.locate++; return { latitude: -2.17, longitude: -79.92 }; },
    fetchJson: async url => { calls.fetch++; calls.urls.push(url); if (fail) throw new Error('offline'); return body; },
    read: (key, fallback) => cache.get(key) ?? fallback,
    write: (key, value) => cache.set(key, value),
    now: () => nowMs,
  };
  const weather = new HomeWeather(deps);
  weather.onChange(() => calls.changes++);
  return { weather, calls, cache, advance: ms => { nowMs += ms; }, now: () => nowMs, setFail: value => { fail = value; } };
}

test('Open-Meteo URL, body parsing and the WMO code to icon table', () => {
  assert.equal(openMeteoUrl(-2.17, -79.92), 'https://api.open-meteo.com/v1/forecast?latitude=-2.1700&longitude=-79.9200&current=temperature_2m,weather_code,is_day');
  assert.deepEqual({ ...parseOpenMeteo(LIVE, 123) }, { temperatureC: 30.3, code: 3, isDay: true, atMs: 123 });
  assert.deepEqual({ ...parseOpenMeteo({ current: { temperature_2m: -1.6, weather_code: 71, is_day: 0 } }, 5) }, { temperatureC: -1.6, code: 71, isDay: false, atMs: 5 });
  assert.equal(parseOpenMeteo({ current: { temperature_2m: 'n/a', weather_code: 3 } }, 1), null);
  assert.equal(parseOpenMeteo({ current: { temperature_2m: 20 } }, 1), null);
  assert.equal(parseOpenMeteo({ error: true, reason: 'bad' }, 1), null);
  assert.equal(parseOpenMeteo(null, 1), null);
  assert.equal(weatherLabel({ temperatureC: 30.3, code: 3, isDay: true, atMs: 0 }), '30°');
  assert.equal(weatherLabel({ temperatureC: -0.4, code: 3, isDay: true, atMs: 0 }), '0°');
  assert.equal(weatherLabel({ temperatureC: 22.5, code: 3, isDay: true, atMs: 0 }), '23°');
  const table = { 0: ['sun', 'moon'], 1: ['cloud-sun', 'cloud-moon'], 2: ['cloud-sun', 'cloud-moon'], 3: ['cloud', 'cloud'], 45: ['cloud', 'cloud'], 48: ['cloud', 'cloud'],
    51: ['cloud-rain', 'cloud-rain'], 61: ['cloud-rain', 'cloud-rain'], 66: ['cloud-rain', 'cloud-rain'], 71: ['cloud-rain', 'cloud-rain'], 77: ['cloud-rain', 'cloud-rain'],
    80: ['cloud-rain', 'cloud-rain'], 86: ['cloud-rain', 'cloud-rain'], 95: ['cloud-lightning', 'cloud-lightning'], 96: ['cloud-lightning', 'cloud-lightning'], 99: ['cloud-lightning', 'cloud-lightning'] };
  for (const [code, [day, night]] of Object.entries(table)) {
    assert.equal(weatherIcon(Number(code), true), day, `${code} day`);
    assert.equal(weatherIcon(Number(code), false), night, `${code} night`);
  }
});

test('refresh fetches once per 30 minutes, publishes the reading, and never without location permission', async () => {
  const denied = fake({ permitted: false });
  denied.weather.refresh();
  await flush();
  assert.deepEqual([denied.calls.locate, denied.calls.fetch], [0, 0]);
  assert.equal(denied.weather.reading(), null);

  const f = fake();
  assert.equal(f.weather.reading(), null);
  f.weather.refresh();
  f.weather.refresh();
  await flush();
  assert.deepEqual([f.calls.locate, f.calls.fetch, f.calls.changes], [1, 1, 1]);
  assert.equal(f.calls.urls[0], openMeteoUrl(-2.17, -79.92));
  assert.deepEqual({ ...f.weather.reading() }, { temperatureC: 30.3, code: 3, isDay: true, atMs: f.now() });
  f.advance(HOME_WEATHER_REFRESH_MS - 1);
  f.weather.refresh();
  await flush();
  assert.equal(f.calls.fetch, 1);
  f.advance(1);
  f.weather.refresh();
  await flush();
  assert.equal(f.calls.fetch, 2);
  assert.equal(f.calls.changes, 2);
});

test('failures are silent, keep the last reading and retry after 10 minutes', async () => {
  const f = fake({ fail: true });
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    f.weather.refresh();
    await flush();
    assert.equal(f.calls.fetch, 1);
    assert.equal(f.weather.reading(), null);
    assert.equal(f.calls.changes, 0);
    f.advance(HOME_WEATHER_RETRY_MS - 1);
    f.weather.refresh();
    await flush();
    assert.equal(f.calls.fetch, 1);
    f.setFail(false);
    f.advance(1);
    f.weather.refresh();
    await flush();
    assert.equal(f.calls.fetch, 2);
    assert.equal(f.weather.reading().code, 3);
    f.setFail(true);
    f.advance(HOME_WEATHER_REFRESH_MS);
    f.weather.refresh();
    await flush();
    assert.equal(f.calls.fetch, 3);
    assert.equal(f.weather.reading().code, 3, 'a failed refresh keeps the previous reading');
    assert.equal(f.calls.changes, 1);
  } finally {
    console.warn = warn;
  }
  assert.ok(warnings.every(line => line.startsWith('home weather:')), warnings.join('\n'));
  assert.equal(warnings.length, 2);
});

test('the cached reading survives a restart, counts toward the 30 minutes, and hides once stale', async () => {
  const first = fake();
  first.weather.refresh();
  await flush();
  const cache = first.cache;
  assert.equal(JSON.parse(cache.get('home.weather')).reading.code, 3);

  const second = fake({ cache });
  assert.equal(second.weather.reading().temperatureC, 30.3);
  second.weather.refresh();
  await flush();
  assert.equal(second.calls.fetch, 0, 'a fresh cache is not refetched');
  second.advance(HOME_WEATHER_STALE_MS + 1);
  assert.equal(second.weather.reading(), null, 'stale readings hide');
  second.weather.refresh();
  await flush();
  assert.equal(second.calls.fetch, 1);
  assert.equal(second.weather.reading().atMs, second.now());

  const corrupt = fake({ cache: new Map([['home.weather', '{not json']]) });
  assert.equal(corrupt.weather.reading(), null);
  const oldVersion = fake({ cache: new Map([['home.weather', JSON.stringify({ version: 0, reading: { temperatureC: 1, code: 0, isDay: true, atMs: 1 } })]]) });
  assert.equal(oldVersion.weather.reading(), null);
});

test('a response without current weather counts as a failure and keeps the reading hidden', async () => {
  const f = fake({ body: { error: true, reason: 'Latitude must be in range' } });
  const warn = console.warn;
  console.warn = () => {};
  try {
    f.weather.refresh();
    await flush();
  } finally {
    console.warn = warn;
  }
  assert.equal(f.calls.fetch, 1);
  assert.equal(f.weather.reading(), null);
  assert.equal(f.cache.size, 0);
});
