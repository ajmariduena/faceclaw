/**
 * The Paseo app's screens in Even's terminal-mode look: one rounded 1 px
 * box filling the 576×288 band, the stock font at a 27 px pitch, dim context
 * lines, white content, a thin rule above the status footer, and no gesture
 * instructions. Pure painters over a `Face` (the stock font, or Roboto when
 * the G2 fonts aren't extracted), so the headless renderer and tests draw
 * exactly what the glasses show.
 *
 * Geometry matches the approved renders in tools/headless-render:
 * paseo-simple.cjs (list, permission box) and paseo-chat-fable.cjs
 * (`ruleslatest` chat).
 */
import type { GrayImage } from "./image";
import { windowBlocks } from "../apps/paseo/paseo-model";

export type Face = {
  readonly lineHeight: number;
  measureLine(text: string): number;
  drawText(image: GrayImage, x: number, y: number, text: string, value?: number): void;
};

export const BAND_WIDTH = 576;
export const BAND_HEIGHT = 288;
export const PITCH = 27;
export const FOOTER_TOP = BAND_HEIGHT - 4 - 40;
export const CONTENT_TOP = 14;
export const CONTENT_BOTTOM = FOOTER_TOP - 8;
export const LEFT = 22;
export const RIGHT = 554;
const RULE_VALUE = 119;
const DIM = 120;
const OLDER_REPLY = 187;
const OLDER_YOU = 153;

export function fitLine(face: Face, text: string, width: number): string {
  const clean = text.replace(/[\r\n\t]/g, " ");
  if (face.measureLine(clean) <= width) return clean;
  const chars = Array.from(clean);
  while (chars.length && face.measureLine(`${chars.join("").trimEnd()}…`) > width) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}

/** Word wrap; a word wider than the line is cut with an ellipsis rather than overflowing. */
export function wrapLines(face: Face, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    if (!word) continue;
    const next = line ? `${line} ${word}` : word;
    if (face.measureLine(next) <= width) line = next;
    else {
      if (line) lines.push(line);
      line = face.measureLine(word) <= width ? word : fitLine(face, word, width);
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** At most `max` lines; the last one ends in an ellipsis when text was cut. */
export function wrapCapped(face: Face, text: string, width: number, max: number): string[] {
  const lines = wrapLines(face, text, width);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  kept[max - 1] = fitLine(face, `${kept[max - 1]} ${lines.slice(max).join(" ")}`, width);
  return kept;
}

export function paintFrame(image: GrayImage): void {
  image.drawRoundedRect(4, 4, 568, 280, 255, 8);
}

export function paintFooter(image: GrayImage, face: Face, left: string, right: string): void {
  image.fillRect(14, FOOTER_TOP, 548, 1, RULE_VALUE);
  const leftText = left ? fitLine(face, left, 300) : "";
  if (leftText) face.drawText(image, LEFT, FOOTER_TOP + 8, leftText, RULE_VALUE);
  if (right) {
    const text = fitLine(face, right, RIGHT - LEFT - (leftText ? face.measureLine(leftText) + 16 : 0));
    face.drawText(image, RIGHT - face.measureLine(text), FOOTER_TOP + 8, text, RULE_VALUE);
  }
}

// ---------------------------------------------------------------------------
// List

export type ListRow = { kind: "section"; label: string; count: number } | { kind: "agent"; title: string; key: string };

export type ListView = {
  rows: readonly ListRow[];
  /** Index into rows of the selected agent row (-1 for none). */
  selected: number;
  footerRight: string;
  /** Dim message instead of rows (unpaired, connecting, empty). */
  message?: string;
};

export const LIST_CAPACITY = Math.floor((FOOTER_TOP - CONTENT_TOP) / PITCH);

/** The first visible row so the selection is on screen, with its section heading when it fits. */
export function listScrollTop(rows: readonly ListRow[], selected: number, previousTop: number): number {
  const maxTop = Math.max(0, rows.length - LIST_CAPACITY);
  let top = Math.min(Math.max(0, previousTop), maxTop);
  if (selected < 0) return top;
  if (selected < top) top = selected;
  if (selected >= top + LIST_CAPACITY) top = selected - LIST_CAPACITY + 1;
  // Keep the heading of the selected row's section visible when the row is right under it.
  if (selected === top && selected > 0 && rows[selected - 1]!.kind === "section") top = selected - 1;
  return Math.min(Math.max(0, top), maxTop);
}

export function paintList(image: GrayImage, face: Face, view: ListView, scrollTop: number): void {
  paintFrame(image);
  if (view.message) {
    const lines = wrapCapped(face, view.message, RIGHT - LEFT, 4);
    lines.forEach((line, index) => face.drawText(image, LEFT, CONTENT_TOP + index * PITCH, line, index === 0 ? 255 : DIM));
  } else {
    let y = CONTENT_TOP;
    for (let index = scrollTop; index < view.rows.length && y + PITCH <= FOOTER_TOP; index++) {
      const row = view.rows[index]!;
      if (row.kind === "section") {
        const count = String(row.count);
        face.drawText(image, LEFT, y, fitLine(face, row.label, 400), DIM);
        face.drawText(image, RIGHT - face.measureLine(count), y, count, DIM);
      } else {
        const selected = index === view.selected;
        if (selected) face.drawText(image, LEFT, y, ">", 255);
        face.drawText(image, 42, y, fitLine(face, row.title, 500), selected ? 255 : 190);
      }
      y += PITCH;
    }
  }
  paintFooter(image, face, "· Paseo", view.footerRight);
}

// ---------------------------------------------------------------------------
// Chat

export type ChatLine = {
  role: "user" | "assistant";
  /** Already condensed to one line (a glance summary) or the first sentence (fallback). */
  text: string;
  /** The user's dictation in progress. */
  live?: boolean;
  action?: boolean;
};

export type PermissionView = {
  question: string;
  options: readonly string[];
  selected: number;
};

export type ChatView = {
  lines: readonly ChatLine[];
  /** Whole messages scrolled back from the newest. */
  scrollBack: number;
  footer: { left: string; right: string } | null;
  permission: PermissionView | null;
  /** Dim message when there are no lines yet. */
  message?: string;
};

const CHAT_GAP = 26;
const USER_INSET = 64;
/** A fallback line may take two lines; summaries take one. */
const MAX_LINES_PER_MESSAGE = 2;

type ChatBlock = { role: ChatLine["role"]; lines: string[]; value: number; height: number };

function chatBlocks(face: Face, lines: readonly ChatLine[]): ChatBlock[] {
  return lines.map((line, index) => {
    const latest = index === lines.length - 1;
    const you = line.role === "user";
    const wrapped = wrapCapped(face, line.text, RIGHT - LEFT - (you ? USER_INSET : 0), MAX_LINES_PER_MESSAGE);
    const value = line.action ? DIM : you ? (line.live || latest ? 255 : OLDER_YOU) : latest ? 255 : OLDER_REPLY;
    return { role: line.role, lines: wrapped, value, height: wrapped.length * PITCH };
  });
}

/** How far back the ring can scroll for this view (whole messages). */
export function chatMaxScrollBack(face: Face, view: ChatView): number {
  const blocks = chatBlocks(face, view.lines);
  return windowBlocks(blocks, chatContentBottom(face, view) - CONTENT_TOP, CHAT_GAP, view.scrollBack).maxScrollBack;
}

/** The approved permission render has no footer: the box sits at the band's bottom. */
const PERMISSION_BOX_BOTTOM = BAND_HEIGHT - 12;

function permissionBoxTop(face: Face, permission: PermissionView): { top: number; questionLines: string[] } {
  const questionLines = wrapCapped(face, permission.question, 520, 3);
  return { top: PERMISSION_BOX_BOTTOM - 10 - (questionLines.length + permission.options.length) * PITCH - 18, questionLines };
}

function chatContentBottom(face: Face, view: ChatView): number {
  if (view.permission) return permissionBoxTop(face, view.permission).top - 14;
  return view.footer ? CONTENT_BOTTOM : BAND_HEIGHT - 12;
}

export function paintChat(image: GrayImage, face: Face, view: ChatView): void {
  paintFrame(image);
  const bottom = chatContentBottom(face, view);
  if (view.lines.length) {
    const blocks = chatBlocks(face, view.lines);
    const { first, end } = windowBlocks(blocks, bottom - CONTENT_TOP, CHAT_GAP, view.scrollBack);
    const shown = blocks.slice(first, end);
    const used = shown.reduce((sum, block, index) => sum + block.height + (index ? CHAT_GAP : 0), 0);
    let y = bottom - used;
    shown.forEach((block, index) => {
      if (index > 0 && first + index === blocks.length - 1) {
        // One rule, above the newest message only.
        image.fillRect(14, y - Math.round(CHAT_GAP / 2) - 1, 548, 1, RULE_VALUE);
      }
      block.lines.forEach((line, lineIndex) => {
        const x = block.role === "user" ? RIGHT - face.measureLine(line) : LEFT;
        face.drawText(image, x, y + lineIndex * PITCH, line, block.value);
      });
      y += block.height + CHAT_GAP;
    });
  } else if (view.message) {
    face.drawText(image, LEFT, CONTENT_TOP, fitLine(face, view.message, RIGHT - LEFT), DIM);
  }
  if (view.permission) {
    const { top, questionLines } = permissionBoxTop(face, view.permission);
    image.drawRoundedRect(14, top, 548, PERMISSION_BOX_BOTTOM - top, 255, 6);
    let y = top + 8;
    for (const line of questionLines) {
      face.drawText(image, 28, y, line, 255);
      y += PITCH;
    }
    view.permission.options.forEach((option, index) => {
      const selected = index === view.permission!.selected;
      if (selected) face.drawText(image, 28, y, ">", 255);
      face.drawText(image, 48, y, fitLine(face, option, 500), selected ? 255 : DIM);
      y += PITCH;
    });
  }
  if (view.footer && !view.permission) paintFooter(image, face, view.footer.left, view.footer.right);
}

// ---------------------------------------------------------------------------
// Choices: an agent's question, or a plan to approve (approved renders in
// tools/headless-render/paseo-questions.cjs)

export type ChoiceRow = {
  label: string;
  /** Shown dim under the row while it is selected. */
  detail?: string;
  /** Multi-select mark: "[x]" / "[ ]". */
  check?: boolean;
};

export type ChoiceView = {
  /** Above the box: the agent's last line (dim) or the plan summary (white), with the gap to the box. */
  heading: { text: string; value: number; maxLines: number; gap: number } | null;
  question: string;
  rows: readonly ChoiceRow[];
  selected: number;
  /** "Other…" dictation in progress, right-aligned inside the box. */
  live?: string;
  footer: { left: string; right: string };
};

const BOX_LEFT = 14;
const BOX_WIDTH = 548;
const BOX_TEXT_LEFT = 28;
const ROW_LEFT = 48;
const CHOICE_DIM = 136;

export function paintChoice(image: GrayImage, face: Face, view: ChoiceView): void {
  paintFrame(image);
  let top = CONTENT_TOP;
  if (view.heading) {
    const lines = wrapCapped(face, view.heading.text, RIGHT - LEFT, view.heading.maxLines);
    lines.forEach((line, index) => face.drawText(image, LEFT, CONTENT_TOP + index * PITCH, line, view.heading!.value));
    top = CONTENT_TOP + lines.length * PITCH + view.heading.gap;
  }
  const bottom = CONTENT_BOTTOM;
  const questionLines = wrapCapped(face, view.question, BOX_WIDTH - 32, 3);
  const liveLines = view.live !== undefined ? 1 : 0;
  // Rows fit between the question and the bottom; the selected row's detail needs a second line.
  const needed = (questionLines.length + Math.min(view.rows.length, 2) + liveLines) * PITCH + 18;
  if (bottom - top < needed) top = Math.max(CONTENT_TOP, bottom - needed);
  const capacity = Math.max(1, Math.floor((bottom - top - 18 - (questionLines.length + liveLines) * PITCH) / PITCH));
  const selected = Math.min(Math.max(0, view.selected), Math.max(0, view.rows.length - 1));
  const detailLines = view.rows[selected]?.detail ? 1 : 0;
  const window = windowRows(view.rows.length, selected, Math.max(1, capacity - detailLines));
  image.drawRoundedRect(BOX_LEFT, top, BOX_WIDTH, bottom - top, 255, 6);
  let y = top + 8;
  for (const line of questionLines) {
    face.drawText(image, BOX_TEXT_LEFT, y, line, 255);
    y += PITCH;
  }
  for (let index = window.first; index < window.end; index++) {
    const row = view.rows[index]!;
    const active = index === selected;
    if (active) face.drawText(image, BOX_TEXT_LEFT, y, ">", 255);
    const mark = row.check === undefined ? "" : row.check ? "[x] " : "[ ] ";
    face.drawText(image, ROW_LEFT, y, fitLine(face, `${mark}${row.label}`, 500), active ? 255 : CHOICE_DIM);
    y += PITCH;
    if (active && row.detail) {
      face.drawText(image, ROW_LEFT, y, fitLine(face, row.detail, 500), RULE_VALUE);
      y += PITCH;
    }
  }
  if (view.live !== undefined) {
    const text = fitLine(face, view.live || "…", 500);
    face.drawText(image, RIGHT - 18 - face.measureLine(text), bottom - 10 - PITCH - 13, text, 255);
  }
  paintFooter(image, face, view.footer.left, view.footer.right);
}

/** The window of `count` rows showing `selected`, `capacity` rows tall. */
function windowRows(count: number, selected: number, capacity: number): { first: number; end: number } {
  if (count <= capacity) return { first: 0, end: count };
  const first = Math.min(Math.max(0, selected - Math.floor(capacity / 2)), count - capacity);
  return { first, end: first + capacity };
}

export type PlanStepsView = {
  steps: readonly string[];
  selected: number;
  footer: { left: string; right: string };
};

const STEP_PITCH = 36;
const STEP_CAPACITY = Math.floor((FOOTER_TOP - CONTENT_TOP) / STEP_PITCH);

export function paintPlanSteps(image: GrayImage, face: Face, view: PlanStepsView): void {
  paintFrame(image);
  const selected = Math.min(Math.max(0, view.selected), Math.max(0, view.steps.length - 1));
  const window = windowRows(view.steps.length, selected, STEP_CAPACITY);
  for (let index = window.first; index < window.end; index++) {
    const y = CONTENT_TOP + (index - window.first) * STEP_PITCH;
    face.drawText(image, LEFT, y, fitLine(face, `${index + 1}. ${view.steps[index]}`, RIGHT - LEFT), index === selected ? 255 : 170);
  }
  paintFooter(image, face, view.footer.left, view.footer.right);
}

// ---------------------------------------------------------------------------
// Pairing

export type PairView = {
  title: string;
  steps: readonly string[];
  draft: string;
  busy: string;
  error: string;
};

export function paintPair(image: GrayImage, face: Face, view: PairView): void {
  paintFrame(image);
  let y = CONTENT_TOP;
  face.drawText(image, LEFT, y, fitLine(face, view.title, RIGHT - LEFT), 255);
  y += PITCH;
  for (const step of view.steps) {
    for (const [index, line] of wrapCapped(face, step, RIGHT - LEFT - 20, 2).entries()) {
      if (index === 0) face.drawText(image, LEFT, y, ">", DIM);
      face.drawText(image, LEFT + 20, y, line, DIM);
      y += PITCH;
    }
  }
  if (view.draft) {
    y += 6;
    face.drawText(image, LEFT, y, fitLine(face, view.draft, RIGHT - LEFT), 220);
    y += PITCH;
  }
  if (view.error) {
    y += 6;
    for (const line of wrapCapped(face, view.error, RIGHT - LEFT, 2)) {
      if (y + PITCH > FOOTER_TOP) break;
      face.drawText(image, LEFT, y, line, 255);
      y += PITCH;
    }
  }
  paintFooter(image, face, view.busy ? `· ${view.busy}` : "· Pair", "");
}
