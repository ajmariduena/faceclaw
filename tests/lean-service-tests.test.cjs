const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');
function serviceEnv() {
  let listener, next = 0, closed = 0, stopped = 0;
  const timers = new Map(), messages = [];
  const load = loader({ setTimeout(cb, ms) { timers.set(++next, { cb, ms }); return next; }, clearTimeout(id) { timers.delete(id); } }, {
    '../apps/paseo/paseo-polyfills': {}, '@nativescript/core': {},
    '../native/socket': { openSocket(_url, l) { listener = l; return { sendText: text => messages.push(text), close() { closed++; } }; } },
    '../apps/paseo/paseo-socket': {}, '../apps/paseo/vendor/paseo-transport': {},
    '../apps/paseo/paseo-store': { loadPairing: () => ({ kind: 'relay' }) },
    '../apps/paseo/paseo-client': { PaseoDaemonClient: class {
      pairing = { kind: 'relay' }; connected = false;
      onChange(cb) { this.changed = cb; return () => {}; }
      start() { this.connected = true; this.changed(); }
      stop() { stopped++; }
      async fetchAgents() { return { entries: [{}, {}] }; }
    } },
  });
  return { api: load('app/phone-ui/api-key-tests.ts'), messages, closed: () => closed, stopped: () => stopped,
    listener: () => listener, timers, tick(ms) { for (const [id, task] of [...timers]) if (task.ms === ms) { timers.delete(id); task.cb(); } } };
}
test('Soniox test waits for authenticated finished, closes the short v5 session and releases timers', async () => {
  const h = serviceEnv(); const pending = h.api.testApiKey('soniox', 'fixture');
  h.listener().onOpen(); assert.equal(JSON.parse(h.messages[0]).model, 'stt-rt-v5');
  h.tick(1000); assert.equal(h.messages[1], '');
  h.listener().onTextMessage('{"finished":true}'); const result = await pending;
  assert.equal(result.status.state, 'ok'); assert.equal(h.closed(), 1); assert.equal(h.timers.size, 0);
});
test('Soniox auth errors and timeouts close the session without storing vendor error text', async () => {
  for (const timeout of [false, true]) {
    const h = serviceEnv(); const pending = h.api.testApiKey('soniox', 'fixture'); h.listener().onOpen();
    if (timeout) h.tick(15000); else h.listener().onTextMessage('{"error_code":401,"error_message":"secret"}');
    const result = await pending; assert.equal(result.status.state, 'failed'); assert.ok(!JSON.stringify(result).includes('secret'));
    assert.equal(h.closed(), 1); assert.equal(h.timers.size, 0);
  }
});
test('Paseo test authenticates, counts agents and stops its own client', async () => {
  const h = serviceEnv(); const result = await h.api.testApiKey('paseo', '');
  assert.equal(result.status.state, 'ok'); assert.match(result.detail, /2 agents · relay/);
  assert.equal(h.stopped(), 1); assert.equal(h.timers.size, 0);
});
