import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const repo = process.env.PASEO_REPO ?? path.join(os.homedir(), 'Documents/Personal/paseo');
const { DaemonClient } = await import(pathToFileURL(path.join(repo, 'packages/client/dist/daemon-client.js')).href);
const client = new DaemonClient({ url: process.env.PASEO_URL ?? 'ws://127.0.0.1:6767/ws', clientId: 'faceclaw-probe' });
await client.connect();

const wav = fs.readFileSync(process.argv[2]);
const pcm = wav.subarray(wav.indexOf('data') + 8);
const format = 'audio/pcm;rate=16000;bits=16';
const id = `probe-${Date.now()}`;
const t0 = Date.now();
await client.startDictationStream(id, format);
const chunk = 3200;
let seq = 0;
for (let off = 0; off < pcm.length; off += chunk) {
  client.sendDictationStreamChunk(id, seq++, pcm.subarray(off, off + chunk).toString('base64'), format);
  await new Promise((r) => setTimeout(r, 100));
}
const sent = Date.now();
const result = await client.finishDictationStream(id, seq - 1);
console.log(`audio ${(pcm.length / 32000).toFixed(1)} s, final ${Date.now() - sent} ms after last chunk: "${result.text}"`);
await client.close();
