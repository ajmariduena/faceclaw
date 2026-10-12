const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');

test('iOS SSE adapter forwards the Kotlin stream events once and stops after cancellation/EOF', () => {
  const instances = [], seen = [];
  const nsObject = { extend: methods => ({ new: () => ({ ...methods }) }) };
  const listenerModule = loader({ NSObject: nsObject }, {})('app/native/kotlin-listener.ios.ts');
  const api = loader({
    FaceclawKitIosSseRequest: { alloc: () => ({ initWithUrlBodyHeadersJsonListener(url, body, headers, listener) {
      const instance = { listener, cancelled: false, cancel() { this.cancelled = true; } };
      instances.push(instance); assert.equal(JSON.parse(headers)['User-Agent'], 'fixture'); assert.equal(url, 'https://fixture'); return instance;
    } }) }, FaceclawKitFaceclawSseListener: {},
  }, { '../util/http': { withUserAgent: headers => ({ ...headers, 'User-Agent': 'fixture' }) }, './kotlin-listener.ios': listenerModule })('app/native/sse.ios.ts');
  const listener = { onLine: line => seen.push(line), onComplete: () => seen.push('complete'), onHttpError: (code, body) => seen.push(`http:${code}:${body}`), onFailure: error => seen.push(`fail:${error}`) };
  const handle = api.openSseRequest('https://fixture', '{}', {}, listener);
  instances[0].listener.onLineLine('first'); assert.deepEqual(seen, ['first']);
  handle.cancel(); handle.cancel(); assert.equal(instances[0].cancelled, true);
  instances[0].listener.onLineLine('after cancel'); instances[0].listener.onComplete(); assert.deepEqual(seen, ['first']);
  api.openSseRequest('https://fixture', '{}', {}, listener);
  instances[1].listener.onLineLine('last'); instances[1].listener.onComplete(); instances[1].listener.onFailureMessage_('late');
  assert.deepEqual(seen, ['first', 'last', 'complete']);
  api.openSseRequest('https://fixture', '{}', {}, listener);
  instances[2].listener.onHttpErrorCodeBody(429, 'slow down'); instances[2].listener.onComplete();
  assert.deepEqual(seen.at(-1), 'http:429:slow down');
});

test('iOS only offers cloud models and reads a saved local-model choice as Auto', () => {
  const api = loader({ global: { isIOS: true } }, { '../native/llama': { LOCAL_MODEL: { label: 'Qwen', id: 'qwen' }, isLocalModelReady: () => false } })('app/assistant/models.ts');
  assert.equal(api.ASSISTANT_MODEL_CHOICES.includes('qwen'), false);
  assert.equal(api.supportedAssistantModel('qwen'), 'auto');
  assert.equal(api.resolveAssistantModel('auto', { openai: 'key', anthropic: '' }).provider, 'openai');
  assert.equal(api.resolveAssistantModel('auto', { openai: '', anthropic: 'key' }).provider, 'anthropic');
  assert.equal(api.resolveAssistantModel('auto', { openai: '', anthropic: '' }), null);
});
