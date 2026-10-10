const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');
const { HomeModel, HOME_CARDS, HOME_SLEEP_GUARD_MS, calendarCardState, emptyCardStatus, homeColumnState, dayLabel } =
  loader()('app/apps/home/home-model.ts');

test('five fixed cards wrap in both directions, Paseo first, with English names', () => {
  const model = new HomeModel();
  assert.deepEqual(Array.from(HOME_CARDS, card => card.id), ['paseo', 'calendar', 'translate', 'converse', 'more']);
  assert.deepEqual(Array.from(HOME_CARDS, card => card.name), ['Paseo', 'Calendar', 'Translate', 'Converse', 'More']);
  assert.deepEqual(Array.from(HOME_CARDS, card => card.appId), ['paseo', 'calendar', 'translate', 'converse', 'launcher']);
  model.move(-1);
  assert.equal(model.selected.id, 'more');
  model.move(1);
  assert.equal(model.selected.id, 'paseo');
  for (const card of HOME_CARDS) {
    assert.equal(model.selected.id, card.id);
    assert.equal(typeof emptyCardStatus(card.id), 'string');
    model.move(1);
  }
  assert.equal(model.selectedIndex, 0);
  assert.equal(HOME_SLEEP_GUARD_MS, 700);
});

test('opening and returning preserve the originating card; wake always shows Paseo', () => {
  const model = new HomeModel();
  for (const card of HOME_CARDS) {
    assert.equal(model.open(), card.appId);
    assert.equal(model.view, 'app');
    model.returnHome();
    assert.equal(model.view, 'home');
    assert.equal(model.selected.id, card.id);
    model.move(1);
  }
  model.move(-1);
  assert.equal(model.open(), 'launcher');
  model.returnHome();
  assert.equal(model.selected.id, 'more');
  model.open();
  model.wake();
  assert.equal(model.selected.id, 'paseo');
  assert.equal(model.view, 'home');
});

test('calendar separates absent permission, loading, errors and an empty day, in English', () => {
  const now = new Date(2026, 9, 10, 9, 41).getTime();
  assert.equal(calendarCardState(false, [], now).status, 'No calendar access');
  assert.equal(calendarCardState(true, [], now).status, 'Nothing today');
  assert.equal(calendarCardState(true, [], now, 'loading').status, 'Loading calendar…');
  assert.equal(calendarCardState(true, [], now, 'error').status, 'Calendar unavailable');
  const event = (title, startMs, endMs) => ({ title, startMs, endMs });
  const events = [event('Tomorrow', now + 86400000, now + 86460000), event('Next', now + 60000, now + 120000),
    event('Ended', now - 60000, now), event('Ongoing', now - 60000, now + 1000), event('Third', now + 180000, now + 240000)];
  const state = calendarCardState(true, events, now);
  assert.deepEqual(Array.from(state.events, e => e.title), ['Ongoing', 'Next']);
  assert.equal(state.day, null);
  assert.equal(calendarCardState(false, events, now).events.length, 0);
});

test('the card shows today\'s next two events, then the next day that has any', () => {
  const now = new Date(2026, 9, 10, 9, 41).getTime();
  const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
  const event = (title, startMs, endMs) => ({ title, startMs, endMs, allDay: false });
  const daily = event('Daily', at(10, 10, 30), at(10, 11));
  const lunch = event('Lunch', at(10, 13), at(10, 14));
  const review = event('Review', at(10, 15), at(10, 16));
  const dentist = event('Dentist', at(11, 9), at(11, 10));
  const planning = event('Planning', at(11, 15), at(11, 16));
  const monday = event('Retro', at(12, 9), at(12, 10));
  let state = calendarCardState(true, [monday, review, daily, lunch, dentist], now);
  assert.deepEqual(state.events, [daily, lunch]);
  assert.equal(state.day, null);
  assert.equal(state.status, null);
  state = calendarCardState(true, [dentist, planning, monday], now);
  assert.deepEqual(state.events, [dentist, planning]);
  assert.equal(state.day, 'Tomorrow');
  state = calendarCardState(true, [monday], now);
  assert.deepEqual(state.events, [monday]);
  assert.equal(state.day, 'Mon, Oct 12');
  state = calendarCardState(true, [daily], now);
  assert.deepEqual(state.events, [daily]);
  assert.equal(state.status, null);
  // A multi-day event that started yesterday belongs to today's card.
  const offsite = event('Offsite', at(9, 9), at(11, 18));
  state = calendarCardState(true, [offsite, dentist], now);
  assert.deepEqual(state.events, [offsite]);
  assert.equal(state.day, null);
  assert.equal(calendarCardState(true, [], now).status, 'Nothing today');
  assert.equal(dayLabel(at(11, 0), now), 'Tomorrow');
  assert.equal(dayLabel(at(12, 0), now), 'Mon, Oct 12');
});

test('the column state pads the clock, abbreviates the day in English and defaults to unknown batteries', () => {
  const paseo = { configured: true, status: '', updates: [], needs: 2, working: 1 };
  const state = homeColumnState(new Date(2026, 9, 10, 9, 41), undefined, undefined, paseo);
  assert.equal(state.hours, '09');
  assert.equal(state.minutes, '41');
  assert.equal(state.day, 'Sat 10');
  assert.deepEqual({ ...state.battery }, { ring: null, glasses: null });
  assert.equal(state.weather, null);
  assert.equal(state.needs, 2);
  const late = homeColumnState(new Date(2026, 11, 31, 22, 7), { ring: 72, glasses: 88 }, null, null);
  assert.equal(late.hours, '22');
  assert.equal(late.minutes, '07');
  assert.equal(late.day, 'Thu 31');
  assert.deepEqual({ ...late.battery }, { ring: 72, glasses: 88 });
  assert.equal(homeColumnState(new Date(2026, 0, 1, 0, 0), undefined, null, null).day, 'Thu 1');
});

test('the column hides Paseo needs without a pairing and maps weather codes onto a few Lucide icons', () => {
  const now = new Date(2026, 9, 10, 9, 41);
  assert.equal(homeColumnState(now, undefined, null, { configured: false, status: '', updates: [], needs: 3, working: 0 }).needs, 0);
  assert.equal(homeColumnState(now, undefined, null, { configured: true, status: 'Mac unreachable', updates: [], needs: 0, working: 0 }).needs, 0);
  const reading = (code, isDay = true, temperatureC = 27.4) => ({ temperatureC, code, isDay, atMs: now.getTime() });
  const icon = (code, isDay) => homeColumnState(now, undefined, reading(code, isDay), null).weather.icon;
  assert.deepEqual({ ...homeColumnState(now, undefined, reading(2), null).weather }, { icon: 'cloud-sun', label: '27°' });
  assert.equal(homeColumnState(now, undefined, reading(0, false, 22.6), null).weather.label, '23°');
  assert.equal(icon(0, true), 'sun');
  assert.equal(icon(0, false), 'moon');
  assert.equal(icon(1, true), 'cloud-sun');
  assert.equal(icon(2, false), 'cloud-moon');
  assert.equal(icon(3, true), 'cloud');
  assert.equal(icon(45, true), 'cloud');
  assert.equal(icon(51, true), 'cloud-rain');
  assert.equal(icon(65, false), 'cloud-rain');
  assert.equal(icon(71, true), 'cloud-rain');
  assert.equal(icon(82, true), 'cloud-rain');
  assert.equal(icon(95, true), 'cloud-lightning');
  assert.equal(icon(99, false), 'cloud-lightning');
});
