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
