const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/load-typescript.cjs');
const api = loader()('app/ui/api-key-status.ts');

test('key tests use each authenticated service and fixed minimal payloads', async () => {
  for (const service of api.API_SERVICES.filter(s => !['soniox', 'paseo'].includes(s))) {
    const calls = [];
    const status = await api.testHttpApiKey(service, ' fixture-key ', async (url, options) => { calls.push({ url, ...options }); return { status: 200 }; }, () => 100);
    assert.equal(status.state, 'ok'); assert.equal(status.ms, 0); assert.equal(calls.length, 1);
    const request = calls[0];
    assert.match(request.url, /^https:\/\//);
    if (service === 'parallel') {
      assert.equal(request.headers['x-api-key'], 'fixture-key');
      assert.equal(JSON.parse(request.body).mode, 'fast');
      assert.deepEqual(JSON.parse(request.body).search_queries, ['Even Realities smart glasses']);
    } else if (service === 'openrouter') assert.equal(request.url, 'https://openrouter.ai/api/v1/auth/key');
    assert.ok(!JSON.stringify(status).includes('fixture-key'));
  }
});

test('missing keys make no request; errors are useful and never retain network secrets', async () => {
  const missing = await api.testHttpApiKey('openrouter', '', () => assert.fail('no fetch'));
  assert.equal(missing.state, 'missing');
  for (const [code, text] of [[401, 'Invalid key'], [402, 'No credit'], [429, 'Rate limited'], [403, 'Permission denied'], [500, 'Service error']]) {
    const status = await api.testHttpApiKey('openrouter', 'secret', async () => ({ status: code }));
    assert.equal(status.state, 'failed'); assert.match(status.error, new RegExp(text));
  }
  const status = await api.testHttpApiKey('mapbox', 'secret', async () => { throw new Error('URL contains access_token=secret'); });
  assert.match(status.error, /Offline/); assert.ok(!JSON.stringify(status).includes('secret'));
  assert.equal(api.resetApiStatus(true, 10).state, 'untested');
  assert.equal(api.apiStatusKey('soniox'), 'apiKeys.status.soniox');
});

test('editing a real ConfigSettingString clears prior test results without deleting other stored keys', () => {
  const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
  const store = new Map([['llm.anthropicApiKey', 'old-secret']]);
  const context = { exports: {}, global: {}, require(id) {
    if (id.includes('settings-store')) return { onSettingsStoreChanged() {}, getStringSetting: (key, fallback) => store.get(key) ?? fallback,
      setStringSetting: (key, value) => store.set(key, value) };
    if (id === './api-key-status') return api;
    return { Layer: class {}, ASSISTANT_MODEL_CHOICES: ['openrouter'] };
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/ui/dashboard-settings.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  const key = context.exports.openRouterApiKeySetting;
  key.set('first-secret'); store.set(api.apiStatusKey('openrouter'), JSON.stringify({ state: 'ok', at: 1, ms: 3, error: null }));
  key.set('second-secret'); assert.equal(JSON.parse(store.get(api.apiStatusKey('openrouter'))).state, 'untested');
  assert.equal(key.displayValue(), '••••••••'); assert.equal(key.inputKind, 'password');
  key.set(''); assert.equal(JSON.parse(store.get(api.apiStatusKey('openrouter'))).state, 'missing');
  assert.equal(store.get('llm.anthropicApiKey'), 'old-secret');
});
