const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

test('a worker window counts as capturing voice while its raw mic tap runs, so the idle timeout waits', () => {
  const worker = { postMessage() {} };
  const load = loader({ global: { isIOS: false } }, {
    '../../graphics/image': {}, './chrome-layer': { windowIcon() {} },
    '../../assistant/tool-registry': { toolRegistry: { removeAppTools() {} } },
    './geometry': { appViewportSize: () => ({ width: 576, height: 260 }) },
    '../../native/frame-timings': {}, './worker-state': {},
    './shell': { shell: { registerWindow() {}, foregroundWindow: () => ({ windowId: 'paseo' }), setTrayIcon() {} } },
  });
  const { WorkerAppHost } = load('app/ui/shell/worker-window.ts');
  let stops = 0;
  const host = new WorkerAppHost({ appId: 'paseo', worker, configureSurface: async () => {}, requestShellRender() {}, removeSurface() {},
    startRawMic: () => ({ stop: () => stops++ }) });
  const window = host.openWindow({ windowId: 'paseo', title: 'Paseo' });
  assert.equal(window.isVoiceCapturing(), false);
  worker.onmessage({ data: { type: 'raw-mic', windowId: 'paseo', on: true } });
  assert.equal(window.isVoiceCapturing(), true);
  worker.onmessage({ data: { type: 'raw-mic', windowId: 'paseo', on: false } });
  assert.equal(window.isVoiceCapturing(), false);
  assert.equal(stops, 1);
});

test('voice-draft relays the standard dictation to the worker: live text, then one final without an empty flash', async () => {
  const posted = [];
  const worker = { postMessage: message => posted.push(message) };
  const transcripts = new Set();
  const voiceDraftModule = loader({ setTimeout, clearTimeout, Promise }, {
    '../native/voice-control': { voiceControlBridge: {
      onTranscript(cb) { transcripts.add(cb); return () => transcripts.delete(cb); },
      onStatus() { return () => {}; },
    } },
    './shell/voice-activity': { voiceActivity: { setActive() {} } },
  })('app/ui/voice-draft.ts');
  const load = loader({ global: { isIOS: false }, Promise }, {
    '../../graphics/image': {}, './chrome-layer': { windowIcon() {} },
    '../../assistant/tool-registry': { toolRegistry: { removeAppTools() {} } },
    './geometry': { appViewportSize: () => ({ width: 576, height: 260 }) },
    '../../native/frame-timings': {}, './worker-state': {},
    './shell': { shell: { registerWindow() {}, foregroundWindow: () => ({ windowId: 'navigate' }), setTrayIcon() {},
      isWindowFocused: () => true, prepareChatVoiceCapture: async () => true } },
  });
  const { WorkerAppHost } = load('app/ui/shell/worker-window.ts');
  let captures = 0, stops = 0;
  const host = new WorkerAppHost({ appId: 'navigate', worker, configureSurface: async () => {}, requestShellRender() {}, removeSurface() {},
    createVoiceDraft: (prepare, changed, send) => new voiceDraftModule.VoiceDraft(
      { startVoiceCapture: async () => { captures++; }, stopVoiceCapture: () => { stops++; } }, prepare, changed, send) });
  const window = host.openWindow({ windowId: 'navigate', title: 'Navigate' });
  worker.onmessage({ data: { type: 'worker-ready' } });
  const drafts = () => posted.filter(m => m.type === 'voice-draft');
  worker.onmessage({ data: { type: 'voice-draft', windowId: 'navigate', action: 'start' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(captures, 1);
  assert.equal(window.isVoiceCapturing(), true);
  for (const cb of transcripts) cb({ text: 'Parque', isFinal: false });
  assert.equal(drafts().at(-1).text, 'Parque');
  assert.equal(drafts().at(-1).phase, 'listening');
  worker.onmessage({ data: { type: 'voice-draft', windowId: 'navigate', action: 'release' } });
  assert.equal(stops, 1);
  const before = drafts().length;
  for (const cb of transcripts) cb({ text: 'Parque Histórico', isFinal: true });
  await new Promise(resolve => setImmediate(resolve));
  const after = drafts().slice(before);
  assert.deepEqual(after.map(m => [m.phase, m.final]), [['idle', 'Parque Histórico']]);
  assert.equal(window.isVoiceCapturing(), false);
});
