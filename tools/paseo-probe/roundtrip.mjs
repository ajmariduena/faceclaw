import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const repo = process.env.PASEO_REPO ?? path.join(os.homedir(), 'Documents/Personal/paseo');
const { createPaseoClient } = await import(pathToFileURL(path.join(repo, 'packages/client/dist/index.js')).href);
const client = createPaseoClient({ url: process.env.PASEO_URL ?? 'ws://127.0.0.1:6767/ws', clientId: 'faceclaw-probe' });
await client.connect();

const t0 = Date.now();
const lap = (label) => console.log(`${String(Date.now() - t0).padStart(6)} ms  ${label}`);
const agent = await client.agents.create({
  config: { provider: 'claude/claude-haiku-4-5', modeId: 'default' },
  cwd: process.env.PROBE_CWD ?? '/tmp/paseo-probe-scratch',
  title: 'Faceclaw probe (desechable)',
  labels: { source: 'faceclaw-probe' },
  prompt: 'Use the Bash tool to run `mkdir -p probe-dir && touch probe-dir/ok && ls probe-dir` and reply with only its output.',
});
lap(`created ${agent.id}`);
try {
  let result = await agent.waitForFinish(120_000);
  lap(`wait -> ${result.status}`);
  if (result.status === 'permission') {
    await agent.refresh();
    const request = agent.pendingPermissions?.[0];
    lap(`permission: kind=${request?.kind} name=${request?.name} title=${request?.title ?? ''}`);
    console.log('        request keys:', Object.keys(request ?? {}).join(','));
    await agent.respondToPermission({ requestId: request.id, response: { behavior: 'allow' } });
    lap('allowed');
    result = await agent.waitForFinish(120_000);
    lap(`wait -> ${result.status}: ${result.lastMessage}`);
  }
  const followUp = await agent.run('Reply with exactly: listo', { timeoutMs: 120_000 });
  lap(`follow-up -> ${followUp.status}: ${followUp.lastMessage}`);
} finally {
  await agent.archive();
  lap('archived');
  await client.close();
}
