const test = require('node:test');
const assert = require('node:assert/strict');
const { OrchestratorConversation, sentencePerLine, parseOrchestratorItem, statusText } = require('../.test-build/app/apps/paseo/paseo-orchestrator.js');

const item = (seq, kind, text, utteranceId = null, code = null) => ({ seq, kind, text, code, utteranceId });

test('the local echo of an utterance is replaced by what the daemon heard, then answered', () => {
  const c = new OrchestratorConversation();
  c.said('u1', 'como van los tests', 1_000);
  assert.equal(c.thinkingSince(2_000), 1_000);
  assert.deepEqual(c.lines(), [{ role: 'user', text: 'como van los tests' }]);
  assert.equal(c.upsert(item(1, 'heard', '¿Cómo van los tests?', 'u1')), true);
  assert.equal(c.upsert(item(2, 'reply', 'Pasaron todos. No queda nada pendiente.', 'u1')), true);
  assert.equal(c.thinkingSince(3_000), null);
  assert.deepEqual(c.lines(), [
    { role: 'user', text: '¿Cómo van los tests?' },
    { role: 'assistant', text: 'Pasaron todos.\nNo queda nada pendiente.' },
  ]);
  assert.equal(c.lastSeq, 2);
});

test('items upsert by seq: a repeated reply does not duplicate, notices are dim, statuses stay off the chat', () => {
  const c = new OrchestratorConversation();
  c.upsert(item(1, 'notice', 'faceclaw terminó. Los tests pasan.'));
  assert.equal(c.upsert(item(1, 'notice', 'faceclaw terminó. Los tests pasan.')), false);
  c.upsert(item(3, 'status', '', 'u2', 'not_heard'));
  c.upsert(item(2, 'reply', 'Listo.'));
  assert.deepEqual(c.lines(), [
    { role: 'assistant', text: 'faceclaw terminó.\nLos tests pasan.', action: true },
    { role: 'assistant', text: 'Listo.' },
  ]);
  assert.equal(statusText('not_heard'), 'Nothing heard.');
});

test('a restarted call numbers from 1 again without overwriting the old items, and history skips unsent echoes', () => {
  const c = new OrchestratorConversation();
  c.upsert(item(1, 'heard', 'hola', 'u1'));
  c.upsert(item(2, 'reply', 'Hola.', 'u1'));
  c.said('u2', 'archiva jelou-cli', 5_000);
  assert.deepEqual(c.history(), ['User: hola', 'Assistant: Hola.']);
  c.restart();
  assert.equal(c.lastSeq, 0);
  c.upsert(item(1, 'heard', 'Archiva jelou-cli.', 'u2'));
  c.upsert(item(2, 'reply', 'Archivé jelou-cli.', 'u2'));
  assert.deepEqual(c.lines().map((l) => l.text), ['hola', 'Hola.', 'Archiva jelou-cli.', 'Archivé jelou-cli.']);
  assert.equal(c.lastSeq, 2);
});

test('a reply that never comes stops the thinking clock; a failed send forgets the echo', () => {
  const c = new OrchestratorConversation();
  c.said('u1', 'hola', 0);
  assert.equal(c.thinkingSince(121_000), null);
  c.forget('u1');
  assert.deepEqual(c.lines(), []);
});

test('sentences go one per line; parse ignores malformed items', () => {
  assert.equal(sentencePerLine('Uno. ¿Dos? Tres 3.5 veces.\n\nCuatro'), 'Uno.\n¿Dos?\nTres 3.5 veces.\nCuatro');
  assert.equal(parseOrchestratorItem({ kind: 'reply' }), null);
  assert.deepEqual(parseOrchestratorItem({ seq: 4, kind: 'reply', text: 'Hola', code: null, utteranceId: 'u' }), item(4, 'reply', 'Hola', 'u'));
});
