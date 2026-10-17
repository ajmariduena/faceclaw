const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { loader } = require('./helpers/load-typescript.cjs');

// Real custom sessions, voice bridge and activity signal; only the Android
// controller, cloud socket, credentials and timers are replaced.
function harness() {
  let controller;
  class Controller {
    constructor() { controller = this; this.starts = 0; this.stops = 0; }
    setListener(listener) { this.listener = listener; }
    setCommunicator(value) { this.communicator = value; }
    setUsePhoneMic() {} setSaveRecordings() {} setEndpointing() {}
    setNoiseSuppression() {} setBeamFilter() {} setOnboardModelKind() {}
    setSpeakerVerification(path, embedding, threshold) { this.verification = { path, embedding, threshold }; }
    clearSpeakerVerification() { this.verification = null; }
    start() { this.starts++; this.active = true; }
    stop() { this.stops++; this.active = false; }
    isCapturing() { return this.active; }
  }
  class NativeArray extends Array {
    static create(_type, length) { return new Array(length).fill(0); }
  }
  const sockets = [];
  class Socket {
    constructor(config) { this.config = config; this.pcm = []; sockets.push(this); }
    start() { this.config.onReady?.(); this.config.onStatus('Listening (Soniox)...'); }
    acceptPcm(pcm) { this.pcm.push(pcm); }
    finish() {} stop() {}
  }
  const bridgeModule = {};
  const communicator = {};
  const load = loader({
    global: { isAndroid: true }, Array: NativeArray,
    setTimeout: () => 1, clearTimeout() {},
    com: { faceclaw: { app: { FaceclawVoiceController: Controller,
      FaceclawVoiceControllerListener: function (listener) { return listener; } } } },
  }, {
    '@nativescript/core': { Utils: { android: { getApplicationContext: () => ({}) } } },
    './java-direct-buffer': { javaBytesToUint8Array: bytes => bytes },
    './elevenlabs-stt': {}, './openai-stt': {}, './soniox-stt': {},
    '../../native/soniox-stt': { SonioxSttClient: Socket },
    '../../native/voice-control': bridgeModule,
    '../../ui/dashboard-settings': { sonioxApiKeySetting: { get: () => 'test-key' } },
    '../evenhub/mic-router': { activeCommunicator: () => communicator },
    './converse-keys': { converseKeys: () => ({}), missingConverseKey: () => null },
  });
  Object.assign(bridgeModule, load('app/native/voice-control.ts'));
  const bridge = bridgeModule.voiceControlBridge;
  const { voiceActivity } = load('app/ui/shell/voice-activity.ts');
  const { ConverseSession } = load('app/apps/converse/converse-session.ts');
  const { TranslateSession } = load('app/apps/translate/translate-session.ts');
  return { bridge, voiceActivity, sockets, communicator,
    controller: () => controller,
    pcm: () => controller.listener.onPcm(new Uint8Array([1, 0, 2, 0])),
    converse: () => new ConverseSession(() => {}, async () => null),
    translate: () => new TranslateSession(() => {}),
  };
}

function controllerHarness(names, globals) {
  const source = ts.createSourceFile('controller.ts', fs.readFileSync('app/g2/dashboard-controller.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const klass = source.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'DashboardController');
  const members = names.map(name => klass.members.find(node => node.name?.getText(source) === name).getText(source));
  const context = { exports: {}, ...globals };
  vm.runInNewContext(ts.transpileModule(`export class Harness { ${members.join('\n')} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return new context.exports.Harness();
}

test('closing Conversar leaves Traducir listening on the shared microphone', () => {
  const h = harness(), converse = h.converse(), translate = h.translate();
  converse.start(); translate.start();
  assert.equal(h.controller().starts, 1);
  h.pcm();
  assert.deepEqual(h.sockets.map(socket => socket.pcm.length), [1, 1]);
  converse.pause();
  assert.equal(h.bridge.isRawCaptureLive(), true);
  h.pcm();
  assert.deepEqual(h.sockets.map(socket => socket.pcm.length), [1, 2]);
  translate.stop();
  assert.equal(h.bridge.isRawCaptureLive(), false);
});

test('an old Translate instance cannot stop a newly opened Translate instance', () => {
  const h = harness(), old = h.translate(), current = h.translate();
  old.start(); current.start(); old.stop(); old.stop();
  assert.equal(h.bridge.isRawCaptureLive(), true);
  h.pcm();
  assert.deepEqual(h.sockets.map(socket => socket.pcm.length), [0, 1]);
  current.stop();
  assert.equal(h.bridge.isRawCaptureLive(), false);
});

test('dictation keeps the custom wearer gate and sends no dictation audio to raw apps', () => {
  const h = harness(), converse = h.converse(), translate = h.translate();
  converse.start(); translate.start();
  h.voiceActivity.setActive(true, 'voice-draft');
  h.bridge.startPushToTalk({ provider: 'onboard', communicator: h.communicator,
    speakerVerification: { speakerModelPath: 'wearer.onnx', wearerEmbedding: new Float32Array([0.25, 0.75]), threshold: 0.55 } });
  assert.deepEqual(h.controller().verification, { path: 'wearer.onnx', embedding: [0.25, 0.75], threshold: 0.55 });
  h.pcm();
  assert.deepEqual(h.sockets.map(socket => socket.pcm.length), [0, 0]);
  h.bridge.stopPushToTalk();
  h.voiceActivity.setActive(false, 'voice-draft');
  h.pcm();
  assert.deepEqual(h.sockets.map(socket => socket.pcm.length), [1, 1]);
  converse.stop(); translate.stop();
});

test('a reconnect resumes remaining owners and never revives a stopped session', () => {
  const h = harness(), converse = h.converse(), translate = h.translate();
  converse.start(); translate.start();
  h.bridge.handleSessionEnded();
  converse.stop();
  const replacement = {};
  h.bridge.resumeCapture({ communicator: replacement });
  assert.equal(h.controller().communicator, replacement);
  h.pcm();
  assert.deepEqual(h.sockets.map(socket => socket.pcm.length), [0, 1]);
  h.bridge.handleSessionEnded();
  translate.stop();
  const starts = h.controller().starts;
  h.bridge.resumeCapture({ communicator: {} });
  assert.equal(h.controller().starts, starts);
  assert.equal(h.bridge.isRawCaptureLive(), false);
});

test('failed custom captures release their claims while dictation remains active', () => {
  const h = harness(), converse = h.converse(), translate = h.translate();
  h.bridge.startPushToTalk({ provider: 'onboard' });
  converse.start(); translate.start();
  assert.equal(converse.state.kind, 'mic-busy');
  assert.equal(translate.state.kind, 'mic-busy');
  assert.equal(h.controller().active, true);
  h.bridge.stopPushToTalk();
  h.bridge.startRawCapture({ communicator: {}, owner: 'probe' });
  h.bridge.stopRawCapture('probe');
  assert.equal(h.bridge.isRawCaptureLive(), false, 'failed requests must not keep the probe alive');
});

test('worker mic handles are isolated from each other and from Conversar', () => {
  const h = harness(), converse = h.converse();
  const controller = controllerHarness(['startRawMicTap'], {
    global: { isAndroid: true }, voiceControlBridge: h.bridge,
    encodeBase64: bytes => Buffer.from(bytes).toString('base64'),
  });
  converse.start();
  const received = [], old = controller.startRawMicTap(() => {});
  const current = controller.startRawMicTap(pcm => received.push(pcm));
  old.stop(); old.stop(); h.pcm();
  assert.equal(received.length, 1);
  current.stop();
  assert.equal(h.bridge.isRawCaptureLive(), true);
  converse.stop();
  assert.equal(h.bridge.isRawCaptureLive(), false);
  h.bridge.startPushToTalk({ provider: 'onboard' });
  assert.equal(typeof controller.startRawMicTap(() => {}), 'string');
  h.bridge.stopPushToTalk();
  h.bridge.startRawCapture({ communicator: {}, owner: 'probe' });
  h.bridge.stopRawCapture('probe');
  assert.equal(h.bridge.isRawCaptureLive(), false);
});

test('overlapping voice activities resume raw apps only after the last owner releases', () => {
  const { voiceActivity } = harness(), events = [];
  voiceActivity.subscribe(active => events.push(active));
  voiceActivity.setActive(true, 'voice-draft');
  voiceActivity.setActive(true, 'continuous-capture');
  voiceActivity.setActive(false, 'voice-draft');
  assert.equal(voiceActivity.isActive(), true);
  voiceActivity.setActive(false, 'continuous-capture');
  assert.deepEqual(events, [true, false]);
});

test('continuous apps share capture and a failed start leaves raw apps available', async () => {
  const h = harness();
  const controller = controllerHarness(['continuousClients', 'continuousAttemptedOn',
    'startContinuousVoiceCapture', 'stopContinuousVoiceCapture', 'ensureContinuousCapture', 'syncContinuousClaim'], {
    voiceControlBridge: h.bridge, voiceActivity: h.voiceActivity, CONTINUOUS_CAPTURE_HOLDER: 'continuous-capture',
  });
  controller.communicator = null;
  controller.beginVoiceCapture = async () => {};
  controller.startContinuousVoiceCapture('transcribe');
  await Promise.resolve();
  assert.equal(h.voiceActivity.isActive(), false);
  controller.communicator = {};
  controller.beginVoiceCapture = async () => {
    h.voiceActivity.setActive(true, 'continuous-capture');
    h.bridge.startContinuousCapture({ provider: 'onboard' });
  };
  controller.ensureContinuousCapture();
  await Promise.resolve();
  controller.startContinuousVoiceCapture('teleprompter');
  assert.equal(h.controller().starts, 1);
  controller.stopContinuousVoiceCapture('transcribe');
  assert.equal(h.voiceActivity.isActive(), true);
  assert.equal(h.controller().active, true);
  controller.stopContinuousVoiceCapture('teleprompter');
  assert.equal(h.voiceActivity.isActive(), false);
  assert.equal(h.controller().active, false);
});
