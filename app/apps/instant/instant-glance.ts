import type { InstantTurn } from "../../assistant/instant/instant-chat";
import { formatAge } from "../paseo/paseo-model";

/** The home card: the last answer and how old it is; `status` when there is none. */
export type InstantGlance = { line: string; age: string; status: string };

export function instantGlance(ready: boolean, last: InstantTurn | null, nowMs: number): InstantGlance {
  if (!ready) return { line: "", age: "", status: "Setup required" };
  if (!last) return { line: "", age: "", status: "Ask anything, instantly" };
  return { line: last.answer, age: formatAge(last.atMs, nowMs), status: "" };
}
