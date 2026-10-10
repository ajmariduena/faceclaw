const test = require('node:test');
const assert = require('node:assert/strict');
const {
  agentBucket, isListedAgent, sectionAgents, sectionCounts, formatAge, formatDuration, formatClock,
  chatEntries, chatEntryFromTimeline, upsertEntry, fallbackLine, plainText, windowBlocks,
} = require('../.test-build/app/apps/paseo/paseo-model.js');
const { buildGlanceSnapshot, glanceWhoLine, glanceEmptyStatus, glanceVerdict, glanceUrgentAgent } = require('../.test-build/app/apps/paseo/paseo-glance.js');

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

test('a sent message and its daemon echo show once, whichever lands first', () => {
  const echoLast = [{ id: 'a1', role: 'assistant', text: '¿Corro los tests?' }];
  assert.equal(upsertEntry(echoLast, { id: 'local:1', role: 'user', text: 'Sí, córrelos' }), true);
  assert.equal(upsertEntry(echoLast, { id: 'msg-9', role: 'user', text: 'Sí, córrelos' }), true);
  assert.deepEqual(echoLast.map((e) => e.id), ['a1', 'msg-9']);

  const echoFirst = [{ id: 'msg-9', role: 'user', text: 'Sí, córrelos' }];
  assert.equal(upsertEntry(echoFirst, { id: 'local:1', role: 'user', text: 'Sí, córrelos' }), false);
  assert.equal(echoFirst.length, 1);

  const repeated = [{ id: 'msg-1', role: 'user', text: 'ok' }, { id: 'a1', role: 'assistant', text: 'x' }, { id: 'a2', role: 'assistant', text: 'y' }, { id: 'a3', role: 'assistant', text: 'z' }];
  assert.equal(upsertEntry(repeated, { id: 'local:2', role: 'user', text: 'ok' }), true);
});

test('the card states a verdict, the agent behind it and a ledger of the rest', () => {
  const line = (a) => `line ${a.id}`;
  const connected = { configured: true, connected: true, status: '' };
  const verdict = (agents) => glanceVerdict(buildGlanceSnapshot(connected, agents, line, NOW), NOW);
  const needs = verdict([
    agent('w1', { status: 'running', updatedAt: iso(-30_000) }),
    agent('n', { title: 'Fix reconnect BLE', updatedAt: iso(-600_000), pendingPermissions: [{ id: 'p', kind: 'tool', name: 'Bash' }] }),
    agent('w2', { status: 'running', updatedAt: iso(-60_000) }),
    agent('d1', { updatedAt: iso(-120_000) }),
    agent('old', { updatedAt: iso(-3 * 86_400_000) }),
  ]);
  assert.equal(needs.verdict, '1 needs you');
  assert.equal(needs.lead.title, 'Fix reconnect BLE', 'the agent that needs you leads even when older');
  assert.equal(needs.ledger, '2 working · 1 done', 'done counts only the last day');
  const working = verdict([agent('w1', { status: 'running', updatedAt: iso(-30_000) }), agent('d1', { updatedAt: iso(-120_000) })]);
  assert.deepEqual([working.verdict, working.lead.agentId, working.ledger], ['Nothing needs you', 'w1', '1 working · 1 done']);
  const done = verdict([agent('d1', { updatedAt: iso(-720_000) }), agent('d2', { updatedAt: iso(-1_200_000) })]);
  assert.deepEqual([done.verdict, done.lead.agentId, done.ledger], ['All done', 'd1', '2 finished · last 12 min']);
  assert.deepEqual([verdict([agent('old', { updatedAt: iso(-3 * 86_400_000) })]).verdict, verdict([]).verdict], ['All quiet', 'No agents']);
  const review = verdict([agent('r', { requiresAttention: true, attentionReason: 'finished', updatedAt: iso(-60_000) }), agent('e', { status: 'error', updatedAt: iso(-90_000) })]);
  assert.deepEqual([review.verdict, review.lead.agentId, review.ledger], ['1 failed', 'e', '1 to review']);

  const live = buildGlanceSnapshot(connected, [agent('n', { pendingPermissions: [{ id: 'p', kind: 'tool', name: 'Bash' }] })], line, NOW);
  assert.equal(glanceUrgentAgent(live), 'n');
  assert.equal(glanceUrgentAgent(buildGlanceSnapshot(connected, [agent('w', { status: 'running' })], line, NOW)), null);
  const dropped = buildGlanceSnapshot({ configured: true, connected: false, status: 'Mac unreachable', lastGood: { counts: live.counts, atMs: NOW - 29 * 60_000 } }, [], line, NOW);
  assert.deepEqual(glanceVerdict(dropped, NOW), { verdict: 'Mac unreachable', lead: null, note: 'Last seen 29 min ago', ledger: 'Was: 1 needs you' });
  assert.equal(glanceUrgentAgent(dropped), null);
  assert.equal(glanceVerdict(buildGlanceSnapshot({ configured: true, connected: false, status: 'Connecting…' }, [], line, NOW), NOW), null, 'no last snapshot: centred status');
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
    agent('d', { title: 'Needs you, older', updatedAt: iso(-600_000), pendingPermissions: [{ id: 'q', kind: 'tool', name: 'Bash' }] }),
  ];
  const snapshot = buildGlanceSnapshot({ configured: true, connected: true, status: '' }, agents, (a) => (a.id === 'a' ? '¿Apruebas correr los tests de BLE?' : 'Listo para fusionar a producción.'));
  assert.deepEqual(snapshot.updates.map((update) => update.agentId), ['a', 'd']);
  assert.equal(snapshot.updates[0].bucket, 'needs');
  assert.equal(glanceWhoLine(snapshot.updates[0], NOW), 'Fix reconnect BLE · 1 min');
  assert.equal(glanceWhoLine(snapshot.updates[1], NOW), 'Needs you, older · 10 min');
  assert.equal(snapshot.needs, 2);
  assert.equal(snapshot.working, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  assert.equal(glanceEmptyStatus(null), 'Not paired');
  assert.equal(glanceEmptyStatus(buildGlanceSnapshot({ configured: false, connected: false, status: '' }, [], () => '')), 'Not paired');
  assert.equal(glanceEmptyStatus(buildGlanceSnapshot({ configured: true, connected: false, status: 'Connecting…' }, agents, () => '')), 'Connecting…');
  assert.equal(glanceEmptyStatus(buildGlanceSnapshot({ configured: true, connected: false, status: '' }, agents, () => '')), 'Mac unreachable');
  assert.equal(glanceEmptyStatus(buildGlanceSnapshot({ configured: true, connected: true, status: '' }, [], () => '')), 'No updates');
});
