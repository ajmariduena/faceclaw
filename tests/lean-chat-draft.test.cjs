const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

function chatEnv() {
  const sent = [], edits = [], errors = [], transcripts = new Set(), statuses = new Set(), timers = new Map();
  let options, home = 0, starts = 0, stops = 0, timerId = 0, available = true, changed;
  const values = new Map();
  const setting = { get: () => values.get('draft') ?? '', set: value => { values.set('draft', value); changed?.('aiChat.draft'); } };
  const record = { id: 'session', model: 'openrouter', session: { isTurnActive: () => false, transcript: [] } };
  const load = loader({ setInterval: () => 1, clearInterval() {}, setTimeout(cb) { timers.set(++timerId, cb); return timerId; }, clearTimeout(id) { timers.delete(id); } }, {
    '../../graphics/image': {}, '../../graphics/ui-fonts': {}, '../../graphics/evenhub-font': {}, '../../graphics/terminal-painter': {},
    '../../assistant/models': {}, '../../ui/window-menu': {},
    '../../ui/dashboard-settings': { aiChatDraftSetting: setting },
    '../../native/settings-store': { onSettingsStoreChanged(cb) { changed = cb; return () => {}; } },
    '../../native/voice-control': { voiceControlBridge: {
      onTranscript(cb) { transcripts.add(cb); return () => transcripts.delete(cb); },
      onStatus(cb) { statuses.add(cb); return () => statuses.delete(cb); },
    } },
    '../../ui/shell/voice-activity': { voiceActivity: { setActive() {} } },
    '../../ui/shell/in-process-window': { createInProcessWindow(value) { options = value; return { requestRender() {} }; } },
    '../../ui/shell/shell': { shell: {
      getAssistantConversations: () => ({ current: () => record, onChanged: () => () => {} }),
      prepareChatVoiceCapture: async () => true, isAssistantAvailable: () => available,
      sendToAssistant: text => sent.push(text), showHome() { home++; }, showAlert: text => errors.push(text),
    } },
  });
  const api = load('app/apps/ai-chat/ai-chat-app.ts');
  api.createAiChatWindow({ actions: { startVoiceCapture() { starts++; }, stopVoiceCapture() { stops++; }, startTextSettingEdit(s) { edits.push(s); } }, setSurfaceVisible() {}, onClosed() {} });
  const input = type => options.baseLayer.handleInput({ type });
  return { api, options, input, sent, edits, errors, setting, starts: () => starts, stops: () => stops, home: () => home,
    unavailable: () => { available = false; }, draft: options.baseLayer.draft,
    transcript(text, isFinal = false) { for (const cb of [...transcripts]) cb({ text, isFinal }); },
    flush() { for (const [id, cb] of [...timers]) { timers.delete(id); cb(); } },
  };
}

test('tap dictation produces a review; only Send transmits and wakeword never replaces a draft', async () => {
  const h = chatEnv();
  h.input('click'); await new Promise(setImmediate);
  assert.equal(h.starts(), 1);
  h.transcript('Pon diez minutos'); h.input('click'); h.transcript('Pon diez minutos.', true); h.flush();
  assert.deepEqual(h.sent, []); assert.equal(h.api.startAiChatDictation(), false);
  h.input('scroll-down'); h.input('click'); assert.equal(h.edits.length, 1);
  h.setting.set('Pon quince minutos.'); h.input('scroll-up'); h.input('click');
  assert.deepEqual(h.sent, ['Pon quince minutos.']);
  h.input('double-click'); assert.equal(h.home(), 1);
  h.options.onClosed(); assert.equal(h.api.startAiChatDictation(), false);
});
test('double tap while listening cancels without sending or navigating; late finals cannot send', async () => {
  const h = chatEnv(); assert.equal(h.api.startAiChatDictation(), true);
  await new Promise(setImmediate); h.transcript('No enviar'); h.input('double-click');
  h.transcript('No enviar', true); h.flush(); assert.deepEqual(h.sent, []); assert.equal(h.home(), 0); assert.equal(h.stops(), 1);
  h.options.receiveTextInput('draft'); h.input('scroll-down'); h.input('scroll-down'); h.input('scroll-down'); h.input('click');
  assert.deepEqual(h.sent, []); h.input('double-click'); assert.equal(h.home(), 1);
});
test('missing credentials preserve the reviewed text', () => {
  const h = chatEnv(); h.options.receiveTextInput('keep me'); h.unavailable(); h.input('click');
  assert.deepEqual(h.sent, []); assert.equal(h.options.baseLayer.review.text, 'keep me'); assert.equal(h.errors[0], 'OpenRouter key missing');
});

test('timer.set preserves AI Chat and opens Timers from other apps', async () => {
  let foreground = 'ai-chat';
  const launched = [], handlers = new Map(), timers = [];
  const load = loader({}, {
    '../ui/shell/shell': { shell: { foregroundWindow: () => ({ appId: foreground }) } },
    '../ui/dashboard-settings': { timeFormatSetting: { get: () => '24h' } },
    './tool-registry': {},
    '../apps/timer/timer-model': { MAX_TIMER_DURATION_MS: 86400000, sortTimers: timers => timers, formatDurationWords: () => 'ten minutes', formatClockAt: () => '10:10' },
    '../apps/timer/timer-engine': { timerEngine: { state: { timers }, startTimer(duration, label) { const timer = { endsAtMs: Date.now() + duration, label }; timers.push(timer); return timer; } } },
  });
  const registry = { registerSystemTool(def, handler) { handlers.set(def.name, handler); } };
  load('app/assistant/timer-tools.ts').registerTimerTools(async app => { launched.push(app); }, registry);
  assert.equal(handlers.get('timer.set')({ minutes: 10 }).ok, true); assert.deepEqual(launched, []);
  foreground = 'home'; assert.equal(handlers.get('timer.set')({ minutes: 10 }).ok, true); assert.deepEqual(launched, ['timer']);
});
