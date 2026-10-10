/** Review is separate from microphone lifetime; only an explicit Send consumes it. */
export class ChatDraft {
  text = "";
  selected = 0;
  editing = false;
  get active(): boolean { return Boolean(this.text) || this.editing; }
  review(text: string): void { this.text = text.trim(); this.selected = 0; this.editing = false; }
  move(delta: number): void { this.selected = Math.max(0, Math.min(2, this.selected + delta)); }
  discard(): void { this.text = ""; this.selected = 0; this.editing = false; }
}
export const DRAFT_OPTIONS = ["Send", "Edit", "Discard"] as const;
