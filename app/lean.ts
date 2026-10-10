/**
 * The lean build's fixed choices (research/lean-spec.md): flags rather than
 * deletions, so the full UI stays in the tree behind them.
 */

/** Android notifications pop over the glasses UI. */
export const LEAN_NOTIFICATION_POPUPS: boolean = false;
/** The phone's permissions page offers notification-listener access. */
export const LEAN_READ_NOTIFICATIONS_PERMISSION: boolean = false;

/**
 * Apps the lean UI never lists (research/lean-spec.md, More): still
 * registered and launchable by id, and shown in the app grid the Developer
 * app keeps.
 */
export const LEAN_HIDDEN_APP_IDS: ReadonlySet<string> = new Set([
  "music", "notifications", "calculator", "terminal", "t3code", "files", "nightscout", "transcribe", "weather",
  "compass", "roam", "blocks", "minesweeper", "freecell", "pinball", "flappy", "evenhub", "glanceboard",
  "teleprompter", "microphones", "developer",
]);
