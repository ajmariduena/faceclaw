const { loader } = require('./load-typescript.cjs');

/**
 * The production Translate app (window, layers, session, reconnecting
 * Soniox wrapper) with only the native boundary stubbed: the Soniox socket,
 * the glasses mic bridge, the key setting, the clock and the shell window.
 */
exports.translateHarness = ({ graphics, face, apiKey = 'soniox-test-key', communicator = {}, micFree = true }) => {
  let now = new Date(2026, 9, 10, 9, 30).getTime();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const sockets = [];
  class FakeSoniox {
    constructor(config) { this.config = config; this.pcm = []; sockets.push(this); }
    start() { this.started = true; }
    acceptPcm(pcm) { this.pcm.push(pcm); }
    finish() { this.finished = true; }
    stop() { this.stopped = true; }
    open() { this.config.onStatus('Listening (Soniox)...'); this.config.onReady?.(); }
    send(tokens) { this.config.onTokens?.(tokens); this.config.onTranscript({ text: '', isFinal: false }); }
  }
  const mic = { listeners: new Set(), starts: 0, stops: 0, free: micFree };
  const bridge = {
    onRawPcm: (listener) => { mic.listeners.add(listener); return () => mic.listeners.delete(listener); },
    startRawCapture: ({ communicator: c }) => { mic.starts++; mic.lastCommunicator = c; return mic.free; },
    stopRawCapture: () => { mic.stops++; },
  };
  const yields = [];
  let window = null;
  let renders = 0;
  const timers = new Map();
  let nextTimer = 0;
  const settings = { apiKey };
  const appLoad = loader({
    Date: Clock,
    console,
    setInterval: (fn, ms) => { timers.set(++nextTimer, { fn, at: now + ms, every: ms }); return nextTimer; },
    clearInterval: (id) => timers.delete(id),
    setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, at: now + ms, every: 0 }); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
  }, {
    '../../graphics/image': graphics,
    '../../ui/gestures': { makeInputEvent: (payload) => ({ ...payload, timestampMs: now }) },
    '../../ui/layers': {},
    '../../ui/shell/in-process-window': {
      YieldAtRootLayer: class {
        constructor(inner) { this.inner = inner; }
        paint(ctx, below) { return this.inner.paint(ctx, below); }
        async handleInput(event, ctx) {
          if (event.type === 'double-click') { yields.push(event); return; }
          await this.inner.handleInput(event, ctx);
        }
      },
      createInProcessWindow: (options) => {
        window = options;
        return { requestRender: () => { renders++; }, stack: {} };
      },
    },
    '../terminal-face': { terminalFace: () => face },
    '../../native/soniox-stt': { SonioxSttClient: FakeSoniox },
    '../../native/voice-control': { voiceControlBridge: bridge },
    '../../ui/dashboard-settings': { sonioxApiKeySetting: { get: () => settings.apiKey } },
    '../evenhub/mic-router': { activeCommunicator: () => communicator },
  });
  const { createTranslateAppWindow } = appLoad('app/apps/translate/translate-app.ts');
  const { voiceActivity } = appLoad('app/ui/shell/voice-activity.ts');
  let closed = 0;
  createTranslateAppWindow({ actions: {}, submitFrame() {}, setSurfaceVisible() {}, removeSurface() {}, onClosed: () => { closed++; } });
  const ctx = { stack: { getBaseSize: () => ({ width: 576, height: 288 }) } };
  return {
    sockets,
    mic,
    yields,
    window: () => window,
    settings,
    voiceActivity,
    renders: () => renders,
    closed: () => closed,
    socket: () => sockets[sockets.length - 1],
    pcm: (bytes) => mic.listeners.forEach((listener) => listener(bytes)),
    advance: (ms) => {
      const target = now + ms;
      for (;;) {
        let next = null;
        for (const [id, timer] of timers) if (timer.at <= target && (!next || timer.at < next[1].at)) next = [id, timer];
        if (!next) break;
        const [id, timer] = next;
        now = timer.at;
        if (timer.every) timer.at += timer.every;
        else timers.delete(id);
        timer.fn();
      }
      now = target;
    },
    now: () => now,
    input: (type) => window.baseLayer.handleInput({ type, source: 'ring', timestampMs: now }, ctx),
    paint: () => window.baseLayer.paint(ctx),
  };
};
