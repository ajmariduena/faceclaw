const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');
function setup() {
  let request;
  const done = [], errors = [], deltas = [];
  const load = loader({ setTimeout, clearTimeout }, { './sse': { openSseRequest(url, body, headers, listener) {
    request = { url, body: JSON.parse(body), headers, listener, cancelled: false };
    return { cancel() { request.cancelled = true; } };
  } } });
  const client = load('app/native/openrouter.ts');
  const handle = client.streamOpenRouterResponse({ apiKey: 'fixture', model: 'openai/gpt-oss-120b', system: 'short',
    messages: [{ role: 'user', content: 'timer' }], tools: [{ name: 'timer_set', description: 'Timer', input_schema: {} }],
    onDone: r => done.push(r), onError: e => errors.push(e), onTextDelta: d => deltas.push(d) });
  const event = data => request.listener.onLine('data: ' + JSON.stringify(data));
  return { client, handle, request, event, done, errors, deltas };
}
test('OpenRouter pins Cerebras and assembles streamed tool arguments for continuation', () => {
  const h = setup();
  assert.equal(h.request.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.deepEqual(h.request.body.provider, { order: ['Cerebras'], allow_fallbacks: false });
  h.event({ choices: [{ delta: { content: 'Listo', tool_calls: [{ index: 0, id: 't1', function: { name: 'timer_set', arguments: '{"minutes":' } }] } }] });
  h.event({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '10}' } }] }, finish_reason: 'tool_calls' }] });
  assert.equal(h.done.length, 0);
  h.request.listener.onLine('data: [DONE]');
  assert.equal(h.done[0].stopReason, 'tool_use');
  assert.equal(h.done[0].content[1].input.minutes, 10);
  const history = h.client.openRouterMessages([{ role: 'assistant', content: h.done[0].content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Started timer' }] }]);
  assert.equal(history[0].tool_calls[0].function.arguments, '{"minutes":10}');
  assert.equal(history[1].role, 'tool'); assert.equal(history[1].tool_call_id, 't1');
});
test('cancellation, malformed tool arguments and premature EOF cannot invoke tools', () => {
  const cancelled = setup(); cancelled.handle.cancel(); cancelled.event({ choices: [{ delta: { content: 'late' }, finish_reason: 'stop' }] });
  cancelled.request.listener.onLine('data: [DONE]'); assert.equal(cancelled.done.length, 0); assert.equal(cancelled.deltas.length, 0);
  const eof = setup(); eof.event({ choices: [{ delta: { tool_calls: [{ index: 0, id: 't', function: { name: 'timer_set', arguments: '{' } }] } }] });
  eof.request.listener.onComplete(); assert.equal(eof.done.length, 0); assert.match(eof.errors[0], /before completion/);
  const invalid = setup(); invalid.event({ choices: [{ delta: { tool_calls: [{ index: 0, id: 't', function: { name: 'timer_set', arguments: '{' } }] }, finish_reason: 'tool_calls' }] });
  invalid.request.listener.onLine('data: [DONE]'); assert.equal(invalid.done.length, 0); assert.match(invalid.errors[0], /invalid tool/);
});
test('lean selection uses OpenRouter and Auto prefers it without losing legacy model IDs', () => {
  const models = loader({ global: {} }, { '../native/llama': { isLocalModelReady: () => false, LOCAL_MODEL: { label: 'Qwen', id: 'qwen' } } })('app/assistant/models.ts');
  const keys = { openrouter: 'key', openai: 'old', anthropic: 'old' };
  assert.equal(models.resolveAssistantModel('auto', keys).provider, 'openrouter');
  assert.equal(models.resolveAssistantModel('openrouter', keys).model, 'openai/gpt-oss-120b');
  assert.equal(models.resolveAssistantModel('terra', keys).provider, 'openai');
  assert.equal(models.resolveAssistantModel('openrouter', { ...keys, openrouter: '' }), null);
});
