const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');
const { HomeModel, HOME_CARDS, calendarCardState, emptyCardStatus, celsiusFromSnapshot } = loader()('app/apps/home/home-model.ts');

test('five stable cards wrap in both directions, including empty cards', () => {
  const model = new HomeModel();
  assert.deepEqual(Array.from(HOME_CARDS, card => card.id), ['calendar', 'music', 'notifications', 'translate', 'more']);
  model.move(-1);
  assert.equal(model.selected.id, 'more');
  model.move(1);
  assert.equal(model.selected.id, 'calendar');
  for (const card of HOME_CARDS) {
    assert.equal(model.selected.id, card.id);
    assert.ok(emptyCardStatus(card.id));
    model.move(1);
  }
  assert.equal(model.selectedIndex, 0);
});

test('opening and returning preserve the originating card; wake always resets', () => {
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
  assert.equal(model.selected.id, 'calendar');
  assert.equal(model.view, 'home');
});

test('calendar separates absent permission, loading, errors and an empty day', () => {
  const now = new Date(2026, 9, 7, 9, 41).getTime();
  assert.equal(calendarCardState(false, [], now).status, 'Sin permiso de calendario');
  assert.equal(calendarCardState(true, [], now).status, 'Sin eventos hoy');
  assert.equal(calendarCardState(true, [], now, 'loading').status, 'Cargando calendario…');
  assert.equal(calendarCardState(true, [], now, 'error').status, 'Calendario no disponible');
  const event = (title, startMs, endMs) => ({ title, startMs, endMs });
  const events = [event('Tomorrow', now + 86400000, now + 86460000), event('Next', now + 60000, now + 120000),
    event('Ended', now - 60000, now), event('Ongoing', now - 60000, now + 1000), event('Third', now + 180000, now + 240000)];
  assert.deepEqual(Array.from(calendarCardState(true, events, now).events, e => e.title), ['Ongoing', 'Next']);
  assert.equal(calendarCardState(false, events, now).events.length, 0);
  assert.equal(calendarCardState(true, events.slice(0, 1), now).status, 'Sin eventos hoy');
});

test('weather uses an existing Fahrenheit snapshot, with no invented temperature', () => {
  assert.equal(celsiusFromSnapshot(75.2), 24);
  assert.equal(celsiusFromSnapshot(14), -10);
  for (const missing of [null, undefined, NaN]) assert.equal(celsiusFromSnapshot(missing), null);
});

test('an empty today includes the next future event, sorted, without leaking unpermitted data', () => {
  const now = new Date(2026, 9, 7, 16, 19).getTime();
  const friday = { title: 'Independencia de Guayaquil', allDay: true,
    startMs: new Date(2026, 9, 9).getTime(), endMs: new Date(2026, 9, 10).getTime() };
  const later = { ...friday, title: 'Later', startMs: new Date(2026, 9, 12).getTime(), endMs: new Date(2026, 9, 13).getTime() };
  const events = [later, { ...friday, endMs: now }, friday];
  const state = calendarCardState(true, events, now);
  assert.equal(state.status, 'Sin eventos hoy');
  assert.equal(state.events.length, 0);
  assert.equal(state.nextEvent, friday);
  assert.equal(calendarCardState(false, events, now).nextEvent, null);
  assert.equal(calendarCardState(true, [], now).nextEvent, null);
  assert.equal(calendarCardState(true, events, now, 'error').nextEvent, null);
  assert.equal(calendarCardState(true, events, new Date(2026, 9, 9, 12).getTime()).nextEvent, null);
  assert.equal(calendarCardState(true, events, new Date(2026, 9, 9, 12).getTime()).events[0], friday);
});
