const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePairingInput, relaySocketUrl, pairingLabel, serializePairing, deserializePairing } = require('../.test-build/app/apps/paseo/paseo-pairing.js');

const offer = (payload) => `https://app.paseo.sh/#offer=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
const FAKE_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

test('a v2 offer link yields a relay pairing with the daemon key', () => {
  const result = parsePairingInput(`  ${offer({ v: 2, serverId: 'srv-1', daemonPublicKeyB64: FAKE_KEY, relay: { endpoint: 'relay.paseo.sh:443', useTls: true } })}  `);
  assert.equal(result.ok, true);
  assert.deepEqual(result.pairing, { kind: 'relay', serverId: 'srv-1', daemonPublicKeyB64: FAKE_KEY, relay: { endpoint: 'relay.paseo.sh:443', useTls: true } });
  assert.equal(relaySocketUrl(result.pairing), 'wss://relay.paseo.sh:443/ws?serverId=srv-1&role=client&v=2');
  assert.equal(pairingLabel(result.pairing), 'relay relay.paseo.sh · srv-1');
  assert.equal(pairingLabel(result.pairing).includes(FAKE_KEY), false);
});

test('useTls defaults from the port when the offer omits it', () => {
  const tls = parsePairingInput(offer({ v: 2, serverId: 's', daemonPublicKeyB64: FAKE_KEY, relay: { endpoint: 'relay.paseo.sh:443' } }));
  assert.equal(tls.pairing.relay.useTls, true);
  const plain = parsePairingInput(offer({ v: 2, serverId: 's', daemonPublicKeyB64: FAKE_KEY, relay: { endpoint: '192.168.1.5:8787' } }));
  assert.equal(plain.pairing.relay.useTls, false);
  assert.equal(relaySocketUrl(plain.pairing), 'ws://192.168.1.5:8787/ws?serverId=s&role=client&v=2');
});

test('bad offers are rejected with a reason', () => {
  assert.match(parsePairingInput('').error, /paseo daemon pair/);
  assert.match(parsePairingInput('https://app.paseo.sh/#offer=!!!').error, /not readable/);
  assert.match(parsePairingInput(offer({ v: 1, serverId: 's' })).error, /version/);
  assert.match(parsePairingInput(offer({ v: 2, serverId: 's', relay: { endpoint: 'x' } })).error, /missing/);
  assert.match(parsePairingInput('hello world').error, /paseo daemon pair/);
});

test('a host or ws URL is a direct pairing to /ws on port 6767 by default', () => {
  assert.deepEqual(parsePairingInput('ws://192.168.1.20:6767/ws').pairing, { kind: 'direct', url: 'ws://192.168.1.20:6767/ws' });
  assert.deepEqual(parsePairingInput('macbook.tail1234.ts.net').pairing, { kind: 'direct', url: 'ws://macbook.tail1234.ts.net:6767/ws' });
  assert.deepEqual(parsePairingInput('wss://paseo.example.com').pairing, { kind: 'direct', url: 'wss://paseo.example.com/ws' });
  assert.equal(pairingLabel({ kind: 'direct', url: 'ws://192.168.1.20:6767/ws' }), '192.168.1.20:6767');
});

test('pairings round-trip through storage and garbage reads as unpaired', () => {
  const relay = { kind: 'relay', serverId: 's', daemonPublicKeyB64: FAKE_KEY, relay: { endpoint: 'relay.paseo.sh:443', useTls: true } };
  assert.deepEqual(deserializePairing(serializePairing(relay)), relay);
  const direct = { kind: 'direct', url: 'ws://h:6767/ws' };
  assert.deepEqual(deserializePairing(serializePairing(direct)), direct);
  assert.equal(deserializePairing(''), null);
  assert.equal(deserializePairing('{'), null);
  assert.equal(deserializePairing('{"kind":"relay"}'), null);
  assert.equal(serializePairing(null), '');
});
