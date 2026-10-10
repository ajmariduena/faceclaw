const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/soniox-translate-two-way.json');
const { loader } = require('./helpers/load-typescript.cjs');

const { TranslationTranscript, formatElapsed } = loader()('app/apps/translate/translate-model.ts');
const view = (transcript) => JSON.parse(JSON.stringify(transcript.segments()));

test('non-final tokens show as the open segment and are replaced by the next response', () => {
  const transcript = new TranslationTranscript();
  assert.equal(transcript.accept(fixture[0].tokens, 1000), true);
  assert.deepEqual(view(transcript), [{ original: 'Hola,', translation: '', language: 'es', translated: false, closed: false }]);
  transcript.accept(fixture[1].tokens, 1100);
  assert.deepEqual(view(transcript), [{ original: 'Hola, ¿cómo', translation: 'Hello,', language: 'es', translated: true, closed: false }]);
  assert.equal(transcript.lastSpeechAtMs, 1100);
});

test('an endpoint closes the segment with its finished translation', () => {
  const transcript = new TranslationTranscript();
  for (const message of fixture.slice(0, 3)) transcript.accept(message.tokens, 1000);
  assert.deepEqual(view(transcript), [{ original: 'Hola, ¿cómo estás?', translation: 'Hello, how are you?', language: 'es', translated: true, closed: true }]);
});

test('a speaker switch splits segments and a lagging translation finds its own segment by source language', () => {
  const transcript = new TranslationTranscript();
  fixture.forEach((message, index) => transcript.accept(message.tokens, 1000 + index));
  assert.deepEqual(view(transcript), [
    { original: 'Hola, ¿cómo estás?', translation: 'Hello, how are you?', language: 'es', translated: true, closed: true },
    { original: "I'm fine, thanks.", translation: 'Estoy bien, gracias.', language: 'en', translated: true, closed: true },
    { original: 'Qué bueno.', translation: "That's great.", language: 'es', translated: true, closed: true },
    { original: 'Bonjour à tous', translation: '', language: 'fr', translated: false, closed: false },
  ]);
  assert.equal(transcript.lastSpeechAtMs, 1005, 'the finished message is not speech');
});

test('a non-final translation of an already closed segment extends that segment for display only', () => {
  const transcript = new TranslationTranscript();
  for (const message of fixture.slice(0, 4)) transcript.accept(message.tokens, 1000);
  transcript.close();
  transcript.accept([{ text: 'Estoy', is_final: false, language: 'es', source_language: 'en', translation_status: 'translation' }], 2000);
  const segments = view(transcript);
  assert.equal(segments.at(-1).original, "I'm fine, thanks.");
  assert.equal(segments.at(-1).translation, 'Estoy');
  assert.equal(segments.length, 2, 'no translation-only open segment');
  transcript.accept([], 2100);
  assert.equal(view(transcript).at(-1).translation, '');
  assert.equal(transcript.lastSpeechAtMs, 1000, 'translations do not count as speech');
});

test('pausing closes the open segment and drops what Soniox will never finalize', () => {
  const transcript = new TranslationTranscript();
  transcript.accept(fixture[1].tokens, 1000);
  transcript.dropLive();
  transcript.close();
  assert.deepEqual(view(transcript), [{ original: 'Hola,', translation: '', language: 'es', translated: true, closed: true }]);
  assert.equal(transcript.close(), false, 'closing twice adds nothing');
  assert.equal(transcript.accept([], 1200), false);
});

test('elapsed time reads m:ss and h:mm:ss', () => {
  assert.equal(formatElapsed(0), '0:00');
  assert.equal(formatElapsed(42_400), '0:42');
  assert.equal(formatElapsed(12 * 60_000 + 5_000), '12:05');
  assert.equal(formatElapsed(3_723_000), '1:02:03');
});
