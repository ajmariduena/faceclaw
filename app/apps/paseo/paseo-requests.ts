/**
 * Pending requests beyond plain tool permissions: an agent's questions
 * (Claude Code AskUserQuestion, Codex request_user_input, opencode) and plan
 * approvals (Claude ExitPlanMode, Codex plan approval). Parsing and answer
 * building mirror Paseo's app (packages/app/src/components/
 * question-form-card-core.ts) so the daemon receives exactly what the
 * app would send. The flow state here is what the ring and tap drive: one
 * question per screen, options as rows, "Other…" dictated.
 *
 * No NativeScript imports: shared by the worker and tests.
 */
import { fallbackLine, plainText, type PermissionRequest } from "./paseo-model";

export type RequestKind = "question" | "plan" | "permission";

export function requestKind(request: PermissionRequest): RequestKind {
  if (request.kind === "question" && parseQuestionFormQuestions(request.input)) return "question";
  if (request.kind === "plan") return "plan";
  return "permission";
}

// ---------------------------------------------------------------------------
// Questions

export type QuestionOption = { label: string; description?: string };

export type QuestionFormQuestion = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
  allowOther: boolean;
  allowEmpty: boolean;
};

export type QuestionSelections = Record<number, ReadonlySet<number>>;
export type QuestionOtherTexts = Record<number, string>;

export function parseQuestionFormQuestions(input: unknown): QuestionFormQuestion[] | null {
  if (typeof input !== "object" || input === null || !Array.isArray((input as Record<string, unknown>).questions)) return null;
  const questions: QuestionFormQuestion[] = [];
  for (const item of (input as Record<string, unknown>).questions as unknown[]) {
    if (typeof item !== "object" || item === null) return null;
    const q = item as Record<string, unknown>;
    if (typeof q.question !== "string" || typeof q.header !== "string" || !Array.isArray(q.options)) return null;
    const options: QuestionOption[] = [];
    for (const opt of q.options as unknown[]) {
      if (typeof opt !== "object" || opt === null) return null;
      const o = opt as Record<string, unknown>;
      if (typeof o.label !== "string") return null;
      options.push({ label: o.label, ...(typeof o.description === "string" ? { description: o.description } : {}) });
    }
    questions.push({
      question: q.question,
      header: q.header,
      options,
      multiSelect: q.multiSelect === true,
      allowOther: q.allowOther === true || q.isOther === true,
      allowEmpty: q.allowEmpty === true,
    });
  }
  return questions.length ? questions : null;
}

export function questionShowsTextInput(question: QuestionFormQuestion): boolean {
  return question.options.length === 0 || question.allowOther;
}

export function isQuestionAnswered(question: QuestionFormQuestion, index: number, selections: QuestionSelections, otherTexts: QuestionOtherTexts): boolean {
  const selected = selections[index];
  if (selected && selected.size > 0) return true;
  if (!questionShowsTextInput(question)) return false;
  const otherText = otherTexts[index]?.trim();
  if (otherText) return true;
  return question.allowEmpty;
}

export function buildQuestionFormAnswers(questions: QuestionFormQuestion[], selections: QuestionSelections, otherTexts: QuestionOtherTexts): Record<string, string> {
  const answers: Record<string, string> = {};
  questions.forEach((q, i) => {
    const selected = selections[i];
    const otherText = otherTexts[i]?.trim();
    const labels = selected ? Array.from(selected).map((index) => q.options[index]!.label) : [];
    if (questionShowsTextInput(q)) {
      if (otherText) {
        // Multi-select keeps the checked options and appends the custom answer, like Claude Code's own UI.
        answers[q.header] = q.multiSelect ? [...labels, otherText].join(", ") : otherText;
        return;
      }
      if (q.allowEmpty && q.options.length === 0) {
        answers[q.header] = "";
        return;
      }
    }
    if (labels.length) answers[q.header] = labels.join(", ");
  });
  return answers;
}

export function shouldSubmitEmptyOnDismiss(questions: QuestionFormQuestion[]): boolean {
  return questions.length > 0 && questions.every((question) => question.allowEmpty && question.options.length === 0);
}

export type PermissionResponse =
  | { behavior: "allow"; selectedActionId?: string; updatedInput?: Record<string, unknown>; updatedPermissions?: unknown[] }
  | { behavior: "deny"; selectedActionId?: string; message?: string };

/** What the Paseo app sends when the form is submitted. */
export function questionSubmitResponse(request: PermissionRequest, questions: QuestionFormQuestion[], selections: QuestionSelections, otherTexts: QuestionOtherTexts): PermissionResponse {
  return {
    behavior: "allow",
    updatedInput: { ...(request.input as Record<string, unknown> | undefined), answers: buildQuestionFormAnswers(questions, selections, otherTexts) },
  };
}

/** What the Paseo app sends when the form is dismissed. */
export function questionDismissResponse(request: PermissionRequest, questions: QuestionFormQuestion[], selections: QuestionSelections, otherTexts: QuestionOtherTexts): PermissionResponse {
  if (shouldSubmitEmptyOnDismiss(questions)) return questionSubmitResponse(request, questions, selections, otherTexts);
  return { behavior: "deny", message: "Dismissed by user" };
}

// ---------------------------------------------------------------------------
// Question flow (one question per screen)

export type QuestionRow = { kind: "option"; index: number; label: string; description?: string } | { kind: "other"; label: "Other…" } | { kind: "submit"; label: "Submit" };

export type QuestionFlow = {
  requestId: string;
  questions: QuestionFormQuestion[];
  /** The question on screen. */
  index: number;
  /** The row ">" is on. */
  cursor: number;
  selections: Record<number, Set<number>>;
  otherTexts: QuestionOtherTexts;
};

export function startQuestionFlow(requestId: string, questions: QuestionFormQuestion[]): QuestionFlow {
  return { requestId, questions, index: 0, cursor: 0, selections: {}, otherTexts: {} };
}

export function questionRows(question: QuestionFormQuestion): QuestionRow[] {
  const rows: QuestionRow[] = question.options.map((option, index) => ({ kind: "option", index, label: option.label, ...(option.description ? { description: option.description } : {}) }));
  if (questionShowsTextInput(question)) rows.push({ kind: "other", label: "Other…" });
  if (question.multiSelect) rows.push({ kind: "submit", label: "Submit" });
  return rows;
}

export function currentQuestion(flow: QuestionFlow): QuestionFormQuestion {
  return flow.questions[flow.index]!;
}

export function moveQuestionCursor(flow: QuestionFlow, delta: number): void {
  const count = questionRows(currentQuestion(flow)).length;
  flow.cursor = ((flow.cursor + delta) % count + count) % count;
}

export type QuestionAction = { type: "dictate" } | { type: "advance" } | { type: "submit" } | { type: "stay" };

/**
 * Tap on the cursor row: single-select picks and moves on, multi-select
 * toggles, Submit moves on (once something is answered), Other… dictates.
 * "advance" means the next question is on screen; "submit" means every
 * question is answered and the response should go out.
 */
export function chooseQuestionRow(flow: QuestionFlow): QuestionAction {
  const question = currentQuestion(flow);
  const row = questionRows(question)[flow.cursor];
  if (!row) return { type: "stay" };
  const selected = (flow.selections[flow.index] ??= new Set<number>());
  if (row.kind === "other") return { type: "dictate" };
  if (row.kind === "option") {
    if (question.multiSelect) {
      if (selected.has(row.index)) selected.delete(row.index);
      else selected.add(row.index);
      return { type: "stay" };
    }
    selected.clear();
    selected.add(row.index);
    delete flow.otherTexts[flow.index];
    return advanceQuestion(flow);
  }
  if (!isQuestionAnswered(question, flow.index, flow.selections, flow.otherTexts)) return { type: "stay" };
  return advanceQuestion(flow);
}

/** The dictated "Other…" answer for the question on screen. */
export function answerQuestionByText(flow: QuestionFlow, text: string): QuestionAction {
  const trimmed = text.trim();
  if (!trimmed) return { type: "stay" };
  const question = currentQuestion(flow);
  flow.otherTexts[flow.index] = trimmed;
  if (!question.multiSelect) flow.selections[flow.index] = new Set<number>();
  return advanceQuestion(flow);
}

function advanceQuestion(flow: QuestionFlow): QuestionAction {
  if (flow.index + 1 >= flow.questions.length) return { type: "submit" };
  flow.index++;
  flow.cursor = 0;
  return { type: "advance" };
}

// ---------------------------------------------------------------------------
// Plans

export type PlanAction = { id: string; label: string; behavior: "allow" | "deny" };

export function planText(request: PermissionRequest & { metadata?: Record<string, unknown> }): string {
  const fromMetadata = request.metadata?.planText;
  if (typeof fromMetadata === "string" && fromMetadata.trim()) return fromMetadata;
  const candidate = (request.input as Record<string, unknown> | undefined)?.plan;
  return typeof candidate === "string" ? candidate : "";
}

/** One sentence for the glasses (the daemon's glance summary replaces it when available). */
export function planSummary(text: string): string {
  const paragraph = text.split(/\n\s*\n/).map((part) => part.trim()).find((part) => part && !part.startsWith("#")) ?? text;
  return fallbackLine(paragraph) || plainText(text).slice(0, 120);
}

/** The plan's list items (numbered or bulleted), else its paragraphs; markdown stripped. */
export function planSteps(text: string): string[] {
  const items = text
    .split("\n")
    .map((line) => /^\s*(?:\d+[.)]|[-*+])\s+(.+)$/.exec(line)?.[1] ?? "")
    .filter(Boolean)
    .map((item) => plainText(item));
  if (items.length) return items;
  return text
    .split(/\n\s*\n/)
    .map((part) => plainText(part))
    .filter((part) => part && !part.trim().startsWith("#"));
}

/**
 * The request's actions (Claude: Reject/Implement, Codex: plan approval),
 * or the Paseo app's defaults; allow actions first so "Approve plan" is
 * the first row.
 */
export function planActions(request: PermissionRequest & { actions?: unknown }): PlanAction[] {
  const given = Array.isArray(request.actions)
    ? (request.actions as Array<Record<string, unknown>>)
        .filter((action) => typeof action?.id === "string" && typeof action.label === "string" && (action.behavior === "allow" || action.behavior === "deny"))
        .map((action) => ({ id: action.id as string, label: action.label as string, behavior: action.behavior as "allow" | "deny" }))
    : [];
  const actions = given.length ? given : [
    { id: "accept", label: "Implement", behavior: "allow" as const },
    { id: "reject", label: "Reject", behavior: "deny" as const },
  ];
  const allow = actions.filter((action) => action.behavior === "allow");
  const deny = actions.filter((action) => action.behavior === "deny");
  return [...allow, ...deny];
}

/** Row labels: the primary allow is "Approve plan", the deny is "Keep planning"; extra actions keep their labels. */
export function planActionLabel(action: PlanAction, actions: PlanAction[]): string {
  if (action.behavior === "deny") return "Keep planning";
  return actions.findIndex((candidate) => candidate.behavior === "allow") === actions.indexOf(action) ? "Approve plan" : action.label;
}

/** What the Paseo app sends for a plan action. */
export function planActionResponse(action: PlanAction): PermissionResponse {
  if (action.behavior === "allow") return { behavior: "allow", selectedActionId: action.id };
  return { behavior: "deny", selectedActionId: action.id, message: "Denied by user" };
}
