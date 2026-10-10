const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { loader } = require('./helpers/load-typescript.cjs');
function worker() {
  const sent = [], cancelled = [], posted = [];
  let final, start, value = '', settingChange;
  const current = { connected: true, sendAgentMessage: async (_id, text) => { sent.push(text); return 'started'; },
    cancelDictation: id => cancelled.push(id), startDictation: () => new Promise(resolve => { start = resolve; }),
    finishDictation: () => new Promise(resolve => { final = resolve; }) };
  const context = { exports: {}, global: { isAndroid: true, postMessage: message => posted.push(message) },
    console, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    require(id) {
      if (id === '../../ui/chat-draft') return loader()('app/ui/chat-draft.ts');
      if (id === './paseo-model') return loader()('app/apps/paseo/paseo-model.ts');
      if (id === './paseo-store') return { hasPaseoBackgroundWork: () => false };
      if (id === '../../native/settings-store') return { onSettingsStoreChanged: cb => { settingChange = cb; } };
      if (id === '../../ui/dashboard-settings') return { paseoChatDraftSetting: { id: 'paseo-chat-draft', get: () => value, set: text => { value = text; settingChange?.('paseo.chatDraft'); } } };
      if (id === '../../ui/sound-effects') return { buildSoundSequencePayload: () => [] };
      if (id === '../../native/frame-timings') return { finishFrame() {} };
      if (id === './paseo-client') return { errorMessage: () => 'fixture failure' };
      return {};
    },
  };
  const source = fs.readFileSync('app/apps/paseo/paseo-app.worker.ts', 'utf8') + `\nexports.test = {
    init(owner) { client = owner; screen = {kind:'chat',agentId:'a'}; window = {windowId:'paseo',foreground:false}; chat = { agentId:'a', entries:[], scrollBack:0, permissionIndex:0 }; },
    listen() { dictation = { id:'d', state:'listening', seq:1, startedMs:0, partial:'draft', preroll:[], micActive:true, target:'message' }; },
    start: () => startDictation('message'), finish: finishDictation, back: () => goBack(1),
    input: type => handleChatInput({type},1), text: handleTextInput,
    review: () => draft, screen: () => screen.kind, close: closeChat
  };`;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
  const api = context.exports.test; api.init(current);
  return { api, sent, cancelled, posted, current, final: text => final(text), started: () => start(), edit: text => { value = text; settingChange('paseo.chatDraft'); } };
}
test('Paseo final transcript waits for review, edit and explicit Send', async () => {
  const h = worker(); h.api.listen(); const pending = h.api.finish(); h.final('Revisa el PR'); await pending;
  assert.deepEqual(h.sent, []); assert.equal(h.api.review().text, 'Revisa el PR');
  h.api.input('scroll-down'); h.api.input('click');
  assert.ok(h.posted.some(m => m.type === 'start-text-setting-edit' && m.settingId === 'paseo-chat-draft'));
  h.edit('Revisa solo los tests'); h.api.input('scroll-up'); h.api.input('click');
  await new Promise(setImmediate); assert.deepEqual(h.sent, ['Revisa solo los tests']); assert.equal(h.api.review().active, false);
});
test('Paseo double tap cancels in-flight dictation and ignores trailing final', async () => {
  const h = worker(); h.api.listen(); const pending = h.api.finish(); h.api.back(); h.final('Never send'); await pending;
  assert.deepEqual(h.sent, []); assert.equal(h.api.review().active, false); assert.equal(h.api.screen(), 'chat');
  assert.deepEqual(h.cancelled, ['d']);
});
test('cancel during daemon startup closes the late session and never reviews or sends', async () => {
  const h = worker(); const pending = h.api.start(); h.api.back(); h.started(); await pending;
  assert.equal(h.cancelled.length, 1); assert.equal(h.api.review().active, false); assert.deepEqual(h.sent, []);
});
test('disconnected Send preserves a Paseo draft, double tap closes only the draft', () => {
  const h = worker(); h.api.text('Keep this'); h.current.connected = false; h.api.input('click');
  assert.equal(h.api.review().text, 'Keep this'); assert.deepEqual(h.sent, []);
  h.api.back(); assert.equal(h.api.review().active, false); assert.equal(h.api.screen(), 'chat');
});
