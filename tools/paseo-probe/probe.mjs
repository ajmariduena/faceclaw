import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const repo = process.env.PASEO_REPO ?? path.join(os.homedir(), 'Documents/Personal/paseo');
const { createPaseoClient } = await import(pathToFileURL(path.join(repo, 'packages/client/dist/index.js')).href);

const url = process.env.PASEO_URL ?? 'ws://127.0.0.1:6767/ws';
const client = createPaseoClient({ url, clientId: 'faceclaw-probe', appVersion: '0.0.1' });
await client.connect();

const page = await client.agents.list({});
const rows = page.entries.map(({ agent }) => agent).filter((a) => !a.archivedAt);
console.log(`agents: ${rows.length} (page entries ${page.entries.length}, hasMore ${page.pageInfo?.hasMore})`);
for (const a of rows.slice(0, 12)) {
  console.log([a.status.padEnd(8), a.requiresAttention ? `!${a.attentionReason}` : '', (a.pendingPermissions?.length ? `perm:${a.pendingPermissions.length}` : ''), a.title?.slice(0, 50), a.updatedAt].filter(Boolean).join('  '));
}

const target = rows.find((a) => a.status === 'idle') ?? rows[0];
if (target) {
  const tl = await client.agents.ref(target.id).timeline.refetch({ limit: 12 });
  console.log(`\ntimeline of "${target.title}" (${tl.entries.length} entries)`);
  for (const e of tl.entries) {
    const item = e.item ?? e;
    const text = item.text ?? item.message ?? item.name ?? item.title ?? '';
    console.log(`  ${item.type}  ${String(text).replace(/\s+/g, ' ').slice(0, 90)}`);
  }
  console.log('\nkeys of one entry:', Object.keys(tl.entries.at(-1) ?? {}), Object.keys(tl.entries.at(-1)?.item ?? {}));
}
await client.close();
