const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');
const { HomeModel, HOME_CARDS, HOME_SLEEP_GUARD_MS, calendarCardState, emptyCardStatus, horizonteClockState, dayLabel } =
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
  assert.equal(state.next.title, 'Ongoing');
  assert.deepEqual(Array.from(state.events, e => e.title), ['Next', 'Third']);
  assert.equal(state.day, null);
  assert.equal(calendarCardState(false, events, now).events.length, 0);
  assert.equal(calendarCardState(false, events, now).next, null);
});

test('the card shows the events after Horizonte\'s, then the next day when today has none left', () => {
  const now = new Date(2026, 9, 10, 9, 41).getTime();
  const at = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
  const event = (title, startMs, endMs) => ({ title, startMs, endMs, allDay: false });
  const daily = event('Daily', at(10, 10, 30), at(10, 11));
  const lunch = event('Lunch', at(10, 13), at(10, 14));
  const dentist = event('Dentist', at(11, 9), at(11, 10));
  const review = event('Review', at(11, 15), at(11, 16));
  const monday = event('Planning', at(12, 9), at(12, 10));
  let state = calendarCardState(true, [monday, review, daily, lunch, dentist], now);
  assert.equal(state.next, daily);
  assert.deepEqual(state.events, [lunch]);
  assert.equal(state.day, null);
  state = calendarCardState(true, [daily, dentist, review, monday], now);
  assert.equal(state.next, daily);
  assert.deepEqual(state.events, [dentist, review]);
  assert.equal(state.day, 'Tomorrow');
  state = calendarCardState(true, [daily, monday], now);
  assert.deepEqual(state.events, [monday]);
  assert.equal(state.day, 'Mon, Oct 12');
  state = calendarCardState(true, [daily], now);
  assert.equal(state.next, daily);
  assert.equal(state.events.length, 0);
  assert.equal(state.status, 'Nothing else today');
  state = calendarCardState(true, [dentist], now);
  assert.equal(state.next, dentist);
  assert.equal(state.status, 'Nothing else');
  assert.equal(dayLabel(at(11, 0), now), 'Tomorrow');
  assert.equal(dayLabel(at(12, 0), now), 'Mon, Oct 12');
});

test('Horizonte counts real minutes, enters Now at the start, and drops expired events', () => {
  const startMs = new Date(2026, 9, 10, 10, 30).getTime();
  const event = { title: 'Daily con el equipo', startMs, endMs: startMs + 30 * 60_000, allDay: false };
  const stateAt = ms => horizonteClockState(calendarCardState(true, [event], ms), new Date(ms));
  assert.equal(stateAt(startMs - 25 * 60_000).eventLine, '10:30 · in 25 min');
  assert.equal(stateAt(startMs - 24 * 60_000).eventLine, '10:30 · in 24 min');
  assert.equal(stateAt(startMs - 1).eventLine, '10:30 · in 1 min');
  assert.equal(stateAt(startMs - 150 * 60_000).eventLine, '10:30 · in 3 h');
  assert.equal(stateAt(startMs).eventLine, '10:30 · Now');
  assert.equal(stateAt(event.endMs - 1).title, event.title);
  assert.equal(stateAt(event.endMs).eventLine, 'Nothing today');
  assert.equal(stateAt(event.endMs).title, null);
  assert.equal(stateAt(startMs).date, 'Saturday, Oct 10');
  assert.equal(stateAt(startMs).time, '10:30');
});

test('Horizonte distinguishes tomorrow, later dates, all-day events and denied calendars', () => {
  const now = new Date(2026, 11, 31, 22, 27);
  const event = { title: 'Plan del año', allDay: false,
    startMs: new Date(2027, 0, 1, 9, 30).getTime(), endMs: new Date(2027, 0, 1, 10, 30).getTime() };
  const stateAt = (events, date = now) => horizonteClockState(calendarCardState(true, events, date.getTime()), date);
  assert.equal(stateAt([event]).time, '22:27');
  assert.equal(stateAt([event]).date, 'Thursday, Dec 31');
  assert.equal(stateAt([event]).eventLine, 'Nothing today');
  assert.equal(stateAt([event]).nextLine, 'Tomorrow 09:30');
  const later = { ...event, startMs: new Date(2027, 0, 2, 9, 30).getTime(), endMs: new Date(2027, 0, 2, 10, 30).getTime() };
  assert.equal(stateAt([later]).nextLine, 'Sat, Jan 2 09:30');
  const allDay = { ...event, allDay: true, startMs: new Date(2027, 0, 1).getTime(), endMs: new Date(2027, 0, 2).getTime() };
  assert.equal(stateAt([allDay]).nextLine, 'Tomorrow · All day');
  assert.equal(stateAt([allDay], new Date(2027, 0, 1, 12)).eventLine, 'All day · Now');
  assert.equal(stateAt([]).title, null);
  assert.equal(stateAt([]).eventLine, 'Nothing today');
  const denied = horizonteClockState(calendarCardState(false, [event], now.getTime()), now);
  assert.equal(denied.title, null);
  assert.equal(denied.eventLine, null);
});
