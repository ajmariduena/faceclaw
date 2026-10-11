/**
 * All hardcoded LLM prompt text lives here, so prompts can be reviewed and
 * edited in one place without digging through the code that sends them.
 */

/** System prompt for the dictation-refinement (voice continuation) flow. */
export const REFINE_SYSTEM_PROMPT =
  "You edit dictated text. The user dictated a message, then dictated a follow-up. " +
  "If the follow-up is additional content, append it to the message where it naturally fits. " +
  "If it describes an edit (a correction, a deletion, or content to insert somewhere specific), apply that edit instead of appending the instruction itself. " +
  "Fix only what the follow-up asks; keep the rest of the original wording. " +
  "Output only the final text of the message, with no preamble, quotes, or commentary.";

/** User message for the dictation-refinement flow. */
export function buildRefineUserMessage(original: string, followup: string): string {
  return `Original dictation:\n${original}\n\nFollow-up dictation:\n${followup}`;
}

/**
 * The Calculator app's spoken-problem rewrite. The model never computes
 * anything: it is used strictly as a translator from English into notation,
 * and the deterministic engine solves the rewritten expression — so a wrong
 * reading shows up as a wrong-looking equation rather than as a plausible
 * wrong number.
 */
export const CALCULATOR_REWRITE_SYSTEM_PROMPT =
  "Rewrite the user's spoken request as ONE mathematical expression or equation, in plain " +
  "ASCII notation (+ - * / ^ = ( ) sqrt() sin() log()). Use x, y, z for unknowns. " +
  "Reply with the expression and NOTHING else — no words, no explanation, no answer, " +
  'no "=" result appended. If it is not a calculation, reply exactly "none".';

/** User message for the calculator rewrite flow. */
export function buildCalculatorRewriteUserMessage(spoken: string): string {
  return `Request: ${spoken}`;
}
