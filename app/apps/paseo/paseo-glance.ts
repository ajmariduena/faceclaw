/**
 * What the home's Paseo card shows: the two latest updates across the
 * user's agents (agent title and age in dim text, the agent's latest line in
 * white) plus the connection state. The Paseo worker builds it from its live
 * connection and publishes it through the host's worker-state channel; the
 * home paints it on the main thread. Plain JSON (it crosses postMessage)
 * with timestamps rather than formatted ages.
 *
 * No NativeScript imports: bundled into the worker as well.
 */
import { agentActivityMs, agentTitle, formatAge, sectionAgents, type AgentSnapshot, type Bucket } from "./paseo-model";

export const PASEO_GLANCE_STATE_KEY = "paseo:glance";

/** How many updates the card shows. */
export const GLANCE_UPDATES = 2;

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
  /** Why there is nothing to show ("Conectando…", ...); "" while connected. */
  status: string;
  updates: PaseoGlanceUpdate[];
  needs: number;
  working: number;
};

export function buildGlanceSnapshot(
  state: { configured: boolean; connected: boolean; status: string },
  agents: Iterable<AgentSnapshot>,
  lineFor: (agent: AgentSnapshot) => string,
): PaseoGlanceSnapshot {
  if (!state.configured) return { configured: false, status: "", updates: [], needs: 0, working: 0 };
  if (!state.connected) return { configured: true, status: state.status || "Mac unreachable", updates: [], needs: 0, working: 0 };
  const sections = sectionAgents(agents);
  const listed = sections.flatMap((section) => section.agents.map((agent) => ({ agent, bucket: section.bucket })));
  // Agents waiting on the user come first, then the most recent activity.
  listed.sort((a, b) => Number(b.bucket === "needs") - Number(a.bucket === "needs")
    || agentActivityMs(b.agent) - agentActivityMs(a.agent));
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
    needs: sections.find((section) => section.bucket === "needs")?.agents.length ?? 0,
    working: sections.find((section) => section.bucket === "working")?.agents.length ?? 0,
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
