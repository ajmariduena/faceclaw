const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Execute production lifecycle methods without booting the UI, BLE or models.
const source = ts.createSourceFile('mic-session.ts', fs.readFileSync('app/apps/microphones/mic-session.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const klass = source.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'MicSession');
function load(names, globals, functions = []) {
  const methods = names.map(name => klass.members.find(node => node.name?.getText(source) === name).getText(source));
  const helpers = functions.map(name => source.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === name).getText(source));
  const context = { exports: {}, console: { warn() {} }, ...globals };
  vm.runInNewContext(ts.transpileModule(`${helpers.join('\n')}\nexport class Session { ${methods.join('\n')} }\n` +
    functions.map(name => `export { ${name} };`).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return context.exports;
}

test('closing captions drains the last line into its own conversation after a new session opens', () => {
  const events = [], timers = new Set();
  const { Session } = load(['stopCaptions', 'clearCaptionRestart', 'stopRun', 'settleRun',
    'handleRunStopped', 'finishConversation', 'handleUtterance'], {
    CAPTION_STOP_TIMEOUT_MS: 20000, CAPTION_LINE_LIMIT: 60,
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
    analyzeLine: () => null, generateSessionInsights() {},
  });
  const session = new Session();
  const conversation = { rowId: 1, sentimentSum: 0, sentimentCount: 0 };
  const run = { conversation, generation: 1, clock: { wallMs: ms => 1000 + ms }, audioBaseMs: 500,
    engine: { requestStop: () => events.push('requested-stop') } };
  Object.assign(session, { captionsActive: true, captionRun: run, conversation, stoppingRuns: new Set(),
    stopRecording: () => events.push('recording-finished'),
    store: () => ({ insertSegment: value => { events.push(JSON.parse(value)); return 7; },
      endSession: id => events.push(`closed:${id}`) }), identifyAndTranslate() {},
  });
  session.stopCaptions();
  assert.deepEqual(events, ['recording-finished', 'requested-stop']);
  assert.equal(timers.size, 1);
  Object.assign(session, { running: true, sessionGeneration: 2, captionLines: [],
    captionRun: { conversation: { rowId: 2 } } });
  session.handleUtterance(run, 'last sentence', null, 10, 20);
  assert.equal(events[2].sessionId, 1);
  assert.equal(events[2].text, 'last sentence');
  assert.equal(events[2].startedAt, 1010);
  assert.equal(events[2].audioOffsetMs, 510);
  assert.deepEqual(session.captionLines, [], 'a late line must not leak into the reopened UI');
  session.handleRunStopped(run, null);
  session.handleRunStopped(run, null);
  assert.equal(events.filter(event => event === 'closed:1').length, 1);
  assert.equal(timers.size, 0);
});

for (const fails of [false, true]) {
  test(`recording conversion ${fails ? 'keeps the WAV if the database update fails' : 'updates the database before deleting the WAV'}`, () => {
    const events = [], files = new Set(['/recording.wav', '/recording.m4a']);
    let transcoder;
    class Transcoder {
      constructor(_wav, _m4a, _bitrate, deleteSource, listener) { this.deleteSource = deleteSource; this.listener = listener; transcoder = this; }
      start() {}
    }
    Transcoder.Listener = function (listener) { return listener; };
    const { transcodeRecording } = load([], {
      RECORDING_AAC_BITRATE: 32000, pendingTranscodes: new Set(),
      com: { faceclaw: { app: { FaceclawAudioTranscoder: Transcoder } } },
      java: { io: { File: class {
        constructor(path) { this.path = path; }
        delete() { events.push(`delete:${this.path}`); return files.delete(this.path); }
      } } },
    }, ['deleteFile', 'transcodeRecording']);
    const store = { setSessionAudio(id, path, codec) {
      events.push(`update:${id}:${path}:${codec}`);
      if (fails) throw Error('disk full');
    } };
    transcodeRecording(store, 7, '/recording.wav');
    assert.equal(transcoder.deleteSource, false);
    transcoder.listener.onDone('/recording.m4a', 1000);
    assert.deepEqual(events, ['update:7:/recording.m4a:aac', `delete:/recording.${fails ? 'm4a' : 'wav'}`]);
    assert.equal(files.has('/recording.wav'), fails);
    assert.equal(files.has('/recording.m4a'), !fails);
  });
}

test('a recording is attached to its conversation as soon as it starts', () => {
  const events = [];
  const { Session } = load(['startRecording'], {
    recordingsDir: () => '/recordings', SAMPLE_RATE: 16000,
    com: { faceclaw: { app: { FaceclawWavRecorder: class {
      constructor(path) { events.push({ created: path }); }
    } } } },
  });
  const session = new Session();
  session.store = () => ({ setSessionAudio: (id, path, codec) => events.push({ id, path, codec }) });
  session.startRecording({ rowId: 9 });
  assert.deepEqual(events[1], { id: 9, path: events[0].created, codec: 'wav' });
});
