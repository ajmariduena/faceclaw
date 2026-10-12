/**
 * What the home's Paseo card shows: how many agents are to review, working,
 * in background and done, plus the newest agents. The Paseo worker builds it
 * from its live connection and publishes it through the host's worker-state
 * channel; the home paints it on the main thread. Plain JSON (it crosses
 * postMessage) with timestamps rather than formatted ages.
 *
 * No NativeScript imports: bundled into the worker as well.
 */
import { agentActivityMs, agentTitle, BUCKET_ORDER, formatAge, sectionAgents, type AgentSnapshot, type Bucket } from "./paseo-model";

export const PASEO_GLANCE_STATE_KEY = "paseo:glance";

/** How many updates the snapshot carries; the first is the card's lead agent. */
export const GLANCE_UPDATES = 2;

export type BucketCounts = Record<Bucket, number>;

/** Done agents count toward the card only this long after their last activity. */
export const GLANCE_DONE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PaseoGlanceUpdate = {
  agentId: string;
  title: string;
  bucket: Bucket;
  /** Last activity, epoch ms (daemon clock). */
  activityMs: number;
  /** The agent's latest line for the glasses (summary, fallback or the pending question); "" while unknown. */
  line: string;
};

export type PaseoGlanceSnapshot = {
  /** A pairing is stored. */
  configured: boolean;
  /** Why there is nothing to show ("Connecting…", ...); "" while connected. */
  status: string;
  /** Most urgent bucket first, then the most recent activity. */
  updates: PaseoGlanceUpdate[];
  counts: BucketCounts;
  needs: number;
  working: number;
  /** While disconnected: when the last connected snapshot was built, and its counts. */
  lastSeenMs: number | null;
  lastCounts: BucketCounts | null;
};

export function emptyCounts(): BucketCounts {
  return { needs: 0, failed: 0, review: 0, working: 0, background: 0, done: 0 };
}

export function buildGlanceSnapshot(
  state: { configured: boolean; connected: boolean; status: string; lastGood?: { counts: BucketCounts; atMs: number } | null },
  agents: Iterable<AgentSnapshot>,
  lineFor: (agent: AgentSnapshot) => string,
  nowMs = Date.now(),
): PaseoGlanceSnapshot {
  const idle = { updates: [], counts: emptyCounts(), needs: 0, working: 0, lastSeenMs: null, lastCounts: null };
  if (!state.configured) return { configured: false, status: "", ...idle };
  if (!state.connected) {
    return { configured: true, status: state.status || "Mac unreachable", ...idle,
      lastSeenMs: state.lastGood?.atMs ?? null, lastCounts: state.lastGood?.counts ?? null };
  }
  const sections = sectionAgents(agents);
  const listed = sections.flatMap((section) => section.agents.map((agent) => ({ agent, bucket: section.bucket })));
  listed.sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket)
    || agentActivityMs(b.agent) - agentActivityMs(a.agent));
  const counts = emptyCounts();
  for (const { agent, bucket } of listed) {
    if (bucket !== "done" || nowMs - agentActivityMs(agent) <= GLANCE_DONE_WINDOW_MS) counts[bucket]++;
  }
  return {
    configured: true,
    status: "",
    updates: listed.slice(0, GLANCE_UPDATES).map(({ agent, bucket }) => ({
      agentId: agent.id,
      title: agentTitle(agent),
      bucket,
      activityMs: agentActivityMs(agent),
      line: lineFor(agent),
    })),
    counts,
    needs: counts.needs,
    working: counts.working,
    lastSeenMs: null,
    lastCounts: null,
  };
}

export type GlanceCounts = {
  /** Needs input, failed and ready to review together; `needsYou` counts the first two. */
  review: number;
  needsYou: number;
  working: number;
  background: number;
  done: number;
  /** The Mac dropped: these are the counts it had when last seen. */
  stale: boolean;
};

/** The home card's four counts; null when it shows a centred status instead (not paired, connecting). */
export function glanceCounts(snapshot: PaseoGlanceSnapshot | null | undefined): GlanceCounts | null {
  if (!snapshot?.configured) return null;
  const counts = snapshot.status ? snapshot.lastCounts : snapshot.counts;
  if (!counts) return null;
  return {
    review: counts.needs + counts.failed + counts.review,
    needsYou: counts.needs + counts.failed,
    working: counts.working,
    background: counts.background ?? 0,
    done: counts.done,
    stale: Boolean(snapshot.status),
  };
}

/** "Fix reconnect BLE · 1 min" */
export function glanceWhoLine(update: PaseoGlanceUpdate, nowMs: number): string {
  return `${update.title} · ${formatAge(update.activityMs, nowMs)}`;
}

/** The card's centred status when it has no updates to show. */
export function glanceEmptyStatus(snapshot: PaseoGlanceSnapshot | null | undefined): string {
  if (!snapshot || !snapshot.configured) return "Not paired";
  if (snapshot.status) return snapshot.status;
  return "No updates";
}
