const test = require('node:test');
const assert = require('node:assert/strict');
const {
  agentBucket, isListedAgent, sectionAgents, sectionCounts, formatAge, formatDuration, formatClock,
  chatEntries, chatEntryFromTimeline, upsertEntry, fallbackLine, plainText, windowBlocks,
} = require('../.test-build/app/apps/paseo/paseo-model.js');
const { buildGlanceSnapshot, glanceWhoLine, glanceEmptyStatus } = require('../.test-build/app/apps/paseo/paseo-glance.js');

const NOW = Date.parse('2026-10-09T12:00:00.000Z');
const iso = (offsetMs) => new Date(NOW + offsetMs).toISOString();

function agent(id, extra = {}) {
  return { id, title: `Agent ${id}`, status: 'idle', createdAt: iso(-3_600_000), updatedAt: iso(-60_000), pendingPermissions: [], labels: {}, ...extra };
}

test('buckets follow the Paseo sidebar rules', () => {
  assert.equal(agentBucket(agent('a', { status: 'running', pendingPermissions: [{ id: 'p', kind: 'tool', name: 'Bash' }] })), 'needs');
  assert.equal(agentBucket(agent('b', { status: 'error', requiresAttention: true })), 'failed');
  assert.equal(agentBucket(agent('c', { status: 'idle', requiresAttention: true, attentionReason: 'finished' })), 'review');
  assert.equal(agentBucket(agent('d', { status: 'running', requiresAttention: true })), 'working');
  assert.equal(agentBucket(agent('e', { status: 'running' })), 'working');
  assert.equal(agentBucket(agent('f', { status: 'idle' })), 'done');
  assert.equal(agentBucket(agent('g', { status: 'initializing' })), 'done');
});

test('subagents, archived and closed agents are hidden', () => {
  assert.equal(isListedAgent(agent('a')), true);
  assert.equal(isListedAgent(agent('b', { labels: { 'paseo.parent-agent-id': 'a' } })), false);
  assert.equal(isListedAgent(agent('c', { archivedAt: iso(-1000) })), false);
  assert.equal(isListedAgent(agent('d', { status: 'closed' })), false);
  assert.equal(isListedAgent(agent('e', { labels: undefined })), true);
});

test('sections keep the sidebar order, skip empty buckets and sort by activity', () => {
  const sections = sectionAgents([
    agent('old-done', { updatedAt: iso(-7_200_000) }),
    agent('new-done', { updatedAt: iso(-10_000) }),
    agent('busy', { status: 'running' }),
    agent('sub', { status: 'running', labels: { 'paseo.parent-agent-id': 'busy' } }),
    agent('ask', { status: 'running', pendingPermissions: [{ id: 'p1', kind: 'tool', name: 'Bash' }] }),
    agent('review', { requiresAttention: true, attentionReason: 'finished' }),
  ]);
  assert.deepEqual(sections.map((section) => section.label), ['Needs input', 'Ready to review', 'Working', 'Done']);
  assert.deepEqual(sections.map((section) => section.agents.map((a) => a.id)), [['ask'], ['review'], ['busy'], ['new-done', 'old-done']]);
  assert.equal(sectionCounts(sections), '1 needs · 1 ready · 1 working · 2 done');
  assert.deepEqual(sectionAgents([]), []);
});

test('ages and durations read like the approved renders', () => {
  assert.equal(formatAge(NOW - 10_000, NOW), 'now');
  assert.equal(formatAge(NOW - 60_000, NOW), '1 min');
  assert.equal(formatAge(NOW - 4 * 60_000, NOW), '4 min');
  assert.equal(formatAge(NOW - 3 * 3_600_000, NOW), '3 h');
  assert.equal(formatAge(NOW - 2 * 86_400_000, NOW), '2 d');
  assert.equal(formatDuration(12_000), '12s');
  assert.equal(formatDuration(61_000), '1m');
  assert.equal(formatDuration(3_720_000), '1h 2m');
  assert.equal(formatClock(4_000), '0:04');
  assert.equal(formatClock(65_000), '1:05');
});

test('chat entries keep only user and assistant messages, keyed by message id', () => {
  const entries = chatEntries([
    { item: { type: 'user_message', text: 'Arregla la reconexión', messageId: 'u1' }, seqStart: 1 },
    { item: { type: 'reasoning', text: 'thinking' }, seqStart: 2 },
    { item: { type: 'tool_call', name: 'Bash', status: 'completed' }, seqStart: 3 },
    { item: { type: 'assistant_message', text: 'La causa: ', messageId: 'a1' }, seqStart: 4 },
    { item: { type: 'assistant_message', text: 'La causa: la conexión muerta.', messageId: 'a1' }, seqStart: 5 },
    { item: { type: 'assistant_message', text: '   ' }, seqStart: 6 },
    { item: { type: 'user_message', text: 'sin id' }, seqStart: 7 },
  ]);
  assert.deepEqual(entries, [
    { id: 'u1', role: 'user', text: 'Arregla la reconexión' },
    { id: 'a1', role: 'assistant', text: 'La causa: la conexión muerta.' },
    { id: 'seq:7', role: 'user', text: 'sin id' },
  ]);
  assert.equal(chatEntryFromTimeline({ item: { type: 'compaction' } }), null);
  const live = chatEntryFromTimeline({ item: { type: 'assistant_message', text: 'ok', messageId: 'm' }, seq: 9 });
  assert.deepEqual(live, { id: 'm', role: 'assistant', text: 'ok' });
  const list = [{ id: 'm', role: 'assistant', text: 'ok' }];
  assert.equal(upsertEntry(list, { id: 'm', role: 'assistant', text: 'ok' }), false);
  assert.equal(upsertEntry(list, { id: 'm', role: 'assistant', text: 'ok!' }), true);
  assert.equal(upsertEntry(list, { id: 'n', role: 'user', text: 'x' }), true);
  assert.equal(list.length, 2);
});

test('fallback lines take the first sentence, without markdown, until the daemon summarizes', () => {
  assert.equal(fallbackLine('**Listo.** Agregué reintentos de 1 a 30 s.\n\n- item'), 'Listo. Agregué reintentos de 1 a 30 s.');
  assert.equal(fallbackLine('La causa: se reusaba la conexión muerta. Lo arreglé.'), 'La causa: se reusaba la conexión muerta.');
  assert.equal(fallbackLine('```sh\nnpm test\n```\nLos 18 tests pasan; listo para commit.'), 'Los 18 tests pasan; listo para commit.');
  assert.equal(fallbackLine('¿Apruebas correr los tests de BLE?'), '¿Apruebas correr los tests de BLE?');
  assert.equal(fallbackLine('Ver [el PR](https://x/y) ahora'), 'Ver el PR ahora');
  assert.equal(fallbackLine(''), '');
  assert.equal(plainText('# Título\n1. uno\n> cita `code`'), 'Título uno cita code');
});

test('the chat window holds whole messages from the newest back, and the ring scrolls back', () => {
  const blocks = [{ height: 27 }, { height: 54 }, { height: 27 }, { height: 54 }];
  // 4 blocks + 3 gaps = 162 + 78 = 240; available 150 fits the last three (135 + 52 = 187 > 150 -> last two: 81 + 26 = 107).
  assert.deepEqual(windowBlocks(blocks, 150, 26, 0), { first: 2, end: 4, maxScrollBack: 3 });
  assert.deepEqual(windowBlocks(blocks, 240, 26, 0), { first: 0, end: 4, maxScrollBack: 3 });
  assert.deepEqual(windowBlocks(blocks, 150, 26, 1), { first: 1, end: 3, maxScrollBack: 3 });
  assert.deepEqual(windowBlocks(blocks, 150, 26, 9), { first: 0, end: 1, maxScrollBack: 3 });
  // A block taller than the window still shows (never an empty screen).
  assert.deepEqual(windowBlocks([{ height: 400 }], 150, 26, 0), { first: 0, end: 1, maxScrollBack: 0 });
  assert.deepEqual(windowBlocks([], 150, 26, 0), { first: 0, end: 0, maxScrollBack: 0 });
});

test('the home card snapshot carries the two latest agents with their lines and states', () => {
  const agents = [
    agent('a', { title: 'Fix reconnect BLE', status: 'running', updatedAt: iso(-60_000), pendingPermissions: [{ id: 'p', kind: 'tool', name: 'Bash' }] }),
    agent('b', { title: 'PR #1221 jelou-cli', updatedAt: iso(-240_000), requiresAttention: true, attentionReason: 'finished' }),
    agent('c', { title: 'Older', updatedAt: iso(-900_000) }),
    agent('sub', { updatedAt: iso(0), labels: { 'paseo.parent-agent-id': 'a' } }),
  ];
  const snapshot = buildGlanceSnapshot({ configured: true, connected: true, status: '' }, agents, (a) => (a.id === 'a' ? '¿Apruebas correr los tests de BLE?' : 'Listo para fusionar a producción.'));
  assert.deepEqual(snapshot.updates.map((update) => update.agentId), ['a', 'b']);
  assert.equal(snapshot.updates[0].bucket, 'needs');
  assert.equal(glanceWhoLine(snapshot.updates[0], NOW), 'Fix reconnect BLE · 1 min');
  assert.equal(glanceWhoLine(snapshot.updates[1], NOW), 'PR #1221 jelou-cli · 4 min');
  assert.equal(snapshot.needs, 1);
  assert.equal(snapshot.working, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  assert.equal(glanceEmptyStatus(null), 'Toca para emparejar');
  assert.equal(glanceEmptyStatus(buildGlanceSnapshot({ configured: false, connected: false, status: '' }, [], () => '')), 'Toca para emparejar');
  assert.equal(glanceEmptyStatus(buildGlanceSnapshot({ configured: true, connected: false, status: 'Conectando…' }, agents, () => '')), 'Conectando…');
  assert.equal(glanceEmptyStatus(buildGlanceSnapshot({ configured: true, connected: true, status: '' }, [], () => '')), 'Sin novedades');
});
