const test = require('node:test');
const assert = require('node:assert/strict');
const { PaseoDaemonClient, PaseoRequestError } = require('../.test-build/app/apps/paseo/paseo-client.js');

/** A fake DaemonTransport the test drives by hand. */
function fakeTransportFactory(log) {
  const transports = [];
  const factory = ({ url }) => {
    const handlers = { open: new Set(), close: new Set(), error: new Set(), message: new Set() };
    const transport = {
      url,
      sent: [],
      closed: null,
      send: (data) => transport.sent.push(JSON.parse(data)),
      close: (code, reason) => { transport.closed = { code, reason }; },
      onOpen: (handler) => { handlers.open.add(handler); return () => handlers.open.delete(handler); },
      onClose: (handler) => { handlers.close.add(handler); return () => handlers.close.delete(handler); },
      onError: (handler) => { handlers.error.add(handler); return () => handlers.error.delete(handler); },
      onMessage: (handler) => { handlers.message.add(handler); return () => handlers.message.delete(handler); },
      open: () => handlers.open.forEach((handler) => handler()),
      receive: (frame) => handlers.message.forEach((handler) => handler(JSON.stringify(frame), false)),
      drop: (event) => handlers.close.forEach((handler) => handler(event)),
      fail: (event) => handlers.error.forEach((handler) => handler(event)),
      serverInfo: () => transport.receive({ type: 'session', message: { type: 'status', payload: { status: 'server_info', serverId: 'srv', hostname: 'mac', version: '0.11.1', capabilities: { glanceSummary: { enabled: true, reason: 'ok' } }, features: {} } } }),
    };
    transports.push(transport);
    log?.(`transport ${transports.length} -> ${url}`);
    return transport;
  };
  return { factory, transports };
}

function makeClient(pairing, overrides = {}) {
  const { factory, transports } = fakeTransportFactory();
  const encrypted = [];
  const adapters = {
    createWebSocketTransportFactory: () => factory,
    createEncryptedTransport: (base, key) => { encrypted.push({ base, key }); return base; },
  };
  const phases = [];
  const client = new PaseoDaemonClient(pairing, { webSocketFactory: () => ({}), adapters, clientId: 'test', appVersion: '0', randomId: (() => { let n = 0; return () => `r${++n}`; })(), ...overrides });
  client.onChange(() => phases.push(`${client.phase}${client.status ? `:${client.status}` : ''}`));
  return { client, transports, encrypted, phases };
}

const RELAY = { kind: 'relay', serverId: 'srv', daemonPublicKeyB64: 'KEY', relay: { endpoint: 'relay.paseo.sh:443', useTls: true } };
const DIRECT = { kind: 'direct', url: 'ws://127.0.0.1:6767/ws' };

test('relay pairings open the relay URL through the encrypted transport; direct ones do not', () => {
  const relay = makeClient(RELAY);
  relay.client.start();
  assert.equal(relay.transports[0].url, 'wss://relay.paseo.sh:443/ws?serverId=srv&role=client&v=2');
  assert.deepEqual(relay.encrypted.map((entry) => entry.key), ['KEY']);
  relay.client.stop();
  const direct = makeClient(DIRECT);
  direct.client.start();
  assert.equal(direct.transports[0].url, 'ws://127.0.0.1:6767/ws');
  assert.equal(direct.encrypted.length, 0);
  direct.client.stop();
});

test('hello goes out on open, server_info makes the client connected, and requests correlate by requestId', async () => {
  const { client, transports, phases } = makeClient(DIRECT);
  client.start();
  const transport = transports[0];
  transport.open();
  assert.equal(transport.sent[0].type, 'hello');
  assert.equal(transport.sent[0].protocolVersion, 1);
  assert.deepEqual(transport.sent[0].capabilities, { hello_rejection: true, selective_agent_timeline: true, glance_summary: true });
  assert.equal(client.connected, false);
  transport.serverInfo();
  assert.equal(client.connected, true);
  assert.equal(client.serverInfo.hostname, 'mac');
  assert.equal(client.supportsGlanceSummary, true);
  const pending = client.fetchAgents({ subscribe: true });
  const request = transport.sent.at(-1);
  assert.equal(request.type, 'session');
  assert.equal(request.message.type, 'fetch_agents_request');
  assert.deepEqual(request.message.subscribe, {});
  assert.equal(request.message.scope, 'active');
  // Another response with a different requestId is ignored.
  transport.receive({ type: 'session', message: { type: 'fetch_agents_response', payload: { requestId: 'other', entries: [] } } });
  transport.receive({ type: 'session', message: { type: 'fetch_agents_response', payload: { requestId: request.message.requestId, entries: [{ agent: { id: 'a' } }] } } });
  assert.deepEqual((await pending).entries, [{ agent: { id: 'a' } }]);
  const rejected = client.fetchAgentTimeline('a', 10);
  const timelineRequest = transport.sent.at(-1).message;
  assert.equal(timelineRequest.direction, 'tail');
  transport.receive({ type: 'session', message: { type: 'fetch_agent_timeline_response', payload: { requestId: timelineRequest.requestId, error: 'nope' } } });
  await assert.rejects(rejected, (error) => error instanceof PaseoRequestError && error.kind === 'rejected' && error.message === 'nope');
  assert.deepEqual(phases, ['connecting:Connecting…', 'connected']);
  client.stop();
  assert.equal(client.phase, 'idle');
});

test('a dropped connection retries with growing backoff and fails in-flight requests', async () => {
  const timers = [];
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;
  global.setTimeout = (fn, ms) => { const timer = { fn, ms, cleared: false }; timers.push(timer); return timer; };
  global.clearTimeout = (timer) => { if (timer) timer.cleared = true; };
  try {
    const { client, transports, phases } = makeClient(DIRECT);
    client.start();
    transports[0].open();
    transports[0].serverInfo();
    const inflight = client.sendAgentMessage('a', 'hola');
    transports[0].drop({ code: 1006, reason: 'relay went away' });
    await assert.rejects(inflight, (error) => error.kind === 'disconnected');
    assert.equal(client.phase, 'retrying');
    assert.match(client.status, /relay went away/);
    const firstDelay = timers.filter((timer) => !timer.cleared).at(-1);
    assert.ok(firstDelay.ms >= 750 && firstDelay.ms <= 1250, `first retry ${firstDelay.ms}`);
    firstDelay.fn();
    assert.equal(transports.length, 2);
    assert.equal(client.phase, 'connecting');
    transports[1].fail({ message: 'Can\'t reach the relay.' });
    const secondDelay = timers.filter((timer) => !timer.cleared).at(-1);
    assert.ok(secondDelay.ms >= 1500 && secondDelay.ms <= 2500, `second retry ${secondDelay.ms}`);
    secondDelay.fn();
    transports[2].open();
    transports[2].serverInfo();
    assert.equal(client.phase, 'connected');
    // Backoff resets after a successful connection.
    transports[2].drop({ code: 1001 });
    const thirdDelay = timers.filter((timer) => !timer.cleared).at(-1);
    assert.ok(thirdDelay.ms >= 750 && thirdDelay.ms <= 1250, `reset retry ${thirdDelay.ms}`);
    assert.deepEqual(phases.map((phase) => phase.split(':')[0]), ['connecting', 'connected', 'retrying', 'connecting', 'retrying', 'connecting', 'connected', 'retrying']);
    client.stop();
    assert.ok(timers.every((timer) => timer.cleared || timer === thirdDelay || timer.fn === firstDelay.fn || timer.fn === secondDelay.fn));
  } finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
  }
});

test('hello.rejected explains itself and the handshake timeout reconnects', () => {
  const timers = [];
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;
  global.setTimeout = (fn, ms) => { const timer = { fn, ms, cleared: false }; timers.push(timer); return timer; };
  global.clearTimeout = (timer) => { if (timer) timer.cleared = true; };
  try {
    const { client, transports } = makeClient(DIRECT);
    client.start();
    transports[0].open();
    transports[0].receive({ type: 'hello.rejected', reason: 'password_required' });
    assert.match(client.status, /password/);
    const ready = timers.find((timer) => timer.ms === 20_000 && !timer.cleared);
    ready.fn();
    assert.equal(client.phase, 'retrying');
    assert.match(client.status, /handshake/);
    client.stop();
  } finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
  }
});

test('session messages reach handlers; dictation and permissions use the documented wire shapes', async () => {
  const { client, transports } = makeClient(DIRECT);
  client.start();
  const transport = transports[0];
  transport.open();
  transport.serverInfo();
  const seen = [];
  client.on('agent_update', (message) => seen.push(message.payload.kind));
  transport.receive({ type: 'session', message: { type: 'agent_update', payload: { kind: 'upsert', agent: { id: 'a' } } } });
  assert.deepEqual(seen, ['upsert']);
  const start = client.startDictation('d1', 'audio/pcm;rate=16000;bits=16');
  assert.deepEqual(transport.sent.at(-1).message, { type: 'dictation_stream_start', dictationId: 'd1', format: 'audio/pcm;rate=16000;bits=16' });
  transport.receive({ type: 'session', message: { type: 'dictation_stream_ack', payload: { dictationId: 'd1', ackSeq: -1 } } });
  await start;
  client.sendDictationChunk('d1', 0, 'QUJD', 'audio/pcm;rate=16000;bits=16');
  assert.equal(transport.sent.at(-1).message.seq, 0);
  const finish = client.finishDictation('d1', 0);
  assert.deepEqual(transport.sent.at(-1).message, { type: 'dictation_stream_finish', dictationId: 'd1', finalSeq: 0 });
  transport.receive({ type: 'session', message: { type: 'dictation_stream_final', payload: { dictationId: 'd1', text: 'hola' } } });
  assert.equal(await finish, 'hola');
  client.respondToPermission('a', 'p1', { behavior: 'allow' });
  assert.deepEqual(transport.sent.at(-1).message, { type: 'agent_permission_response', agentId: 'a', requestId: 'p1', response: { behavior: 'allow' } });
  const summary = client.summarizeForGlance([{ id: 'm1', role: 'assistant', text: 'long text' }], 'a');
  const summaryRequest = transport.sent.at(-1).message;
  assert.equal(summaryRequest.type, 'glance.summarize.request');
  assert.equal(summaryRequest.agentId, 'a');
  transport.receive({ type: 'session', message: { type: 'glance.summarize.response', payload: { requestId: summaryRequest.requestId, lines: [{ id: 'm1', line: 'Corto.' }], error: null } } });
  assert.deepEqual(await summary, [{ id: 'm1', line: 'Corto.' }]);
  assert.throws(() => { client.stop(); client.send({ type: 'ping' }); }, (error) => error.kind === 'disconnected');
});
