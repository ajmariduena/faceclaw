/**
 * Smoke test of Faceclaw's own Paseo client (app/apps/paseo/paseo-client.ts)
 * against the local daemon: direct ws://127.0.0.1:6767/ws first, then through
 * the relay with the daemon's own pairing offer (never printed). Read-only
 * unless --write: that creates one throwaway Haiku agent labelled
 * source=faceclaw-probe, drives a permission and a follow-up through this
 * client, and archives it.
 *
 *   node tools/paseo-probe/faceclaw-client.mjs [--write] [--relay] [--dump]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
process.env.NODE_PATH = path.join(root, "tools/headless-render/node_modules");
const require = createRequire(import.meta.url);
require("node:module").Module._initPaths();
const { loader } = require(path.join(root, "tests/helpers/load-typescript.cjs"));

const args = new Set(process.argv.slice(2));
const dump = args.has("--dump");

// The vendored transport is an ES module in a CommonJS tree; import a temp .mjs copy.
const vendorCopy = path.join(os.tmpdir(), `paseo-transport-${process.pid}.mjs`);
fs.copyFileSync(path.join(root, "app/apps/paseo/vendor/paseo-transport.js"), vendorCopy);
const adapters = await import(pathToFileURL(vendorCopy).href);
fs.unlinkSync(vendorCopy);

const load = loader({ TextDecoder, TextEncoder, setTimeout, clearTimeout, Date, JSON, Math, ArrayBuffer, Promise, Error }, {
  "./vendor/paseo-transport": adapters,
});
const { PaseoDaemonClient } = load("app/apps/paseo/paseo-client.ts");
const { parsePairingInput } = load("app/apps/paseo/paseo-pairing.ts");

const log = (message) => console.log(`${new Date().toISOString().slice(11, 23)}  ${message}`);
const deps = {
  webSocketFactory: (url) => new WebSocket(url),
  adapters,
  clientId: "faceclaw-probe",
  appVersion: "faceclaw-dev",
  log: (message) => log(`  [client] ${message}`),
};

function connect(pairing, label) {
  const client = new PaseoDaemonClient(pairing, deps);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: not connected after 20 s (${client.phase}: ${client.status})`)), 20_000);
    client.onChange(() => {
      log(`${label}: ${client.phase}${client.status ? ` (${client.status})` : ""}`);
      if (client.connected) {
        clearTimeout(timer);
        resolve(client);
      }
    });
    client.start();
  });
}

function bucket(agent) {
  if (agent.pendingPermissions?.length) return "Needs input";
  if (agent.status === "error") return "Failed";
  if (agent.requiresAttention) return "Ready to review";
  if (agent.status === "running") return "Working";
  return "Done";
}

const summarize = (item) => {
  const text = item.text ?? item.name ?? item.message ?? "";
  return `${item.type}${item.status ? `/${item.status}` : ""}${item.messageId ? ` id=${item.messageId.slice(0, 8)}` : ""}  ${String(text).replace(/\s+/g, " ").slice(0, 70)}`;
};

async function exercise(client, label) {
  const info = client.serverInfo;
  log(`${label}: server ${info.hostname ?? "?"} ${info.version ?? "?"} features=${Object.keys(info.features).length} glanceSummary=${client.supportsGlanceSummary}`);
  const page = await client.fetchAgents({ subscribe: true });
  const agents = page.entries.map((entry) => entry.agent);
  const shown = agents.filter((agent) => !agent.archivedAt && agent.status !== "closed" && !agent.labels?.["paseo.parent-agent-id"]);
  log(`${label}: ${agents.length} agents (${shown.length} top-level), hasMore=${page.pageInfo?.hasMore}`);
  if (dump) log(`entry keys: ${Object.keys(page.entries[0] ?? {}).join(",")}; agent keys: ${Object.keys(agents[0] ?? {}).join(",")}`);
  const counts = {};
  for (const agent of shown) counts[bucket(agent)] = (counts[bucket(agent)] ?? 0) + 1;
  log(`${label}: buckets ${JSON.stringify(counts)}`);
  const target = shown.find((agent) => agent.status === "idle") ?? shown[0];
  if (target) {
    const timeline = await client.fetchAgentTimeline(target.id, 30);
    log(`${label}: timeline of "${target.title}": ${timeline.entries.length} entries, hasMore=${timeline.hasMore}`);
    if (dump) {
      log(`timeline payload keys: ${Object.keys(timeline).join(",")}; entry keys: ${Object.keys(timeline.entries[0] ?? {}).join(",")}`);
      for (const entry of timeline.entries.slice(-12)) log(`    ${summarize(entry.item ?? entry)}`);
    }
  }
  return { agents: shown, target };
}

const direct = await connect({ kind: "direct", url: process.env.PASEO_URL ?? "ws://127.0.0.1:6767/ws" }, "direct");
const { target } = await exercise(direct, "direct");

if (args.has("--relay")) {
  const offer = await direct.getPairingOffer();
  const parsed = parsePairingInput(offer.url);
  if (!parsed.ok) throw new Error(`pairing offer not parsed: ${parsed.error}`);
  log(`relay: offer parsed (relayEnabled=${offer.relayEnabled}, endpoint ${parsed.pairing.relay.endpoint}, tls ${parsed.pairing.relay.useTls})`);
  const relay = await connect(parsed.pairing, "relay");
  await exercise(relay, "relay");
  relay.stop();
}

if (args.has("--write")) {
  const repo = process.env.PASEO_REPO ?? path.join(os.homedir(), "Documents/Personal/paseo");
  const { createPaseoClient } = await import(pathToFileURL(path.join(repo, "packages/client/dist/index.js")).href);
  const sdk = createPaseoClient({ url: process.env.PASEO_URL ?? "ws://127.0.0.1:6767/ws", clientId: "faceclaw-probe-sdk" });
  await sdk.connect();
  const events = [];
  direct.on("agent_stream", (message) => {
    const event = message.payload.event;
    events.push(event.type);
    if (dump || event.type !== "timeline") log(`    stream ${event.type}${event.item ? `: ${summarize(event.item)}` : ""}${typeof message.payload.seq === "number" ? ` seq=${message.payload.seq}` : ""}`);
  });
  direct.on("agent_update", (message) => log(`    agent_update ${message.payload.kind} ${message.payload.agent?.status ?? ""} attn=${message.payload.agent?.requiresAttention ?? ""} perms=${message.payload.agent?.pendingPermissions?.length ?? ""}`));
  direct.on("agent_attention_required", (message) => log(`    attention ${message.payload.reason} shouldNotify=${message.payload.shouldNotify}`));
  direct.on("agent_permission_request", (message) => log(`    permission_request ${message.payload.request?.id?.slice(0, 8)}`));
  const agent = await sdk.agents.create({
    config: { provider: "claude/claude-haiku-4-5", modeId: "default" },
    cwd: "/tmp/paseo-probe-scratch",
    title: "Faceclaw probe (desechable)",
    labels: { source: "faceclaw-probe" },
    prompt: "Use the Bash tool to run `mkdir -p probe-dir && touch probe-dir/ok && ls probe-dir` and reply with only its output.",
  });
  log(`write: created ${agent.id}`);
  try {
    await direct.setTimelineSubscription([agent.id]);
    const waitFor = (predicate, timeoutMs) =>
      new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = async () => {
          const page = await direct.fetchAgents({});
          const snapshot = page.entries.map((entry) => entry.agent).find((candidate) => candidate.id === agent.id);
          if (snapshot && predicate(snapshot)) return resolve(snapshot);
          if (Date.now() - started > timeoutMs) return reject(new Error("timed out waiting for the agent"));
          setTimeout(tick, 500);
        };
        void tick();
      });
    const pending = await waitFor((snapshot) => snapshot.pendingPermissions?.length || snapshot.status === "idle", 120_000);
    if (pending.pendingPermissions?.length) {
      const request = pending.pendingPermissions[0];
      log(`write: permission ${request.kind} ${request.name} title=${request.title ?? ""} keys=${Object.keys(request).join(",")}`);
      if (dump) log(`    request: ${JSON.stringify(request).slice(0, 600)}`);
      direct.respondToPermission(agent.id, request.id, { behavior: "allow" });
      await waitFor((snapshot) => snapshot.status === "idle" && !snapshot.pendingPermissions?.length, 120_000);
      log("write: allowed, finished");
    }
    const disposition = await direct.sendAgentMessage(agent.id, "Reply with exactly: listo");
    log(`write: follow-up ${disposition}`);
    const done = await waitFor((snapshot) => snapshot.status === "idle" && snapshot.activeTurn == null, 120_000);
    log(`write: done status=${done.status} attn=${done.requiresAttention} reason=${done.attentionReason}`);
    const timeline = await direct.fetchAgentTimeline(agent.id, 20);
    for (const entry of timeline.entries) log(`    ${summarize(entry.item ?? entry)}`);
    log(`write: stream events seen: ${JSON.stringify(events.reduce((acc, type) => ({ ...acc, [type]: (acc[type] ?? 0) + 1 }), {}))}`);
  } finally {
    const archived = await direct.archiveAgent(agent.id);
    log(`write: archived at ${archived.archivedAt}`);
    await sdk.close();
  }
}

direct.stop();
log("ok");
