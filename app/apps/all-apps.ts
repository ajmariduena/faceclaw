import { type AppDefinition } from "./app-definition";
import aiChatApp from "./ai-chat";
import launcherApp from "./launcher";
import homeApp from "./home";
import timerApp from "./timer";
import calculatorApp from "./calculator";
import terminalApp from "./terminal";
import t3codeApp from "./t3code";
import paseoApp from "./paseo";
import converseApp from "./converse";
import filesApp from "./files";
import musicApp from "./music";
import nightscoutApp from "./nightscout";
import transcribeApp from "./transcribe";
import teleprompterApp from "./teleprompter";
import microphonesApp from "./microphones";
import notificationsApp from "./notifications";
import calendarApp from "./calendar";
import weatherApp from "./weather";
import navigateApp from "./navigate";
import compassApp from "./compass";
import roamApp from "./roam";
import blocksApp from "./blocks";
import minesweeperApp from "./minesweeper";
import freecellApp from "./freecell";
import pinballApp from "./pinball";
import flappyApp from "./flappy";
import developerApp from "./developer";
import evenhubApp from "./evenhub";
import glanceboardApp from "./glanceboard";
import settingsApp from "./settings";

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

/**
 * Every app, in launcher-grid order (the launcher itself is first but hidden
 * from the grid). The sole registry: the controller, launcher, and assistant
 * tools all discover apps here.
 */
export const ALL_APPS: readonly AppDefinition[] = [
  launcherApp,
  homeApp,
  aiChatApp,
  timerApp,
  calculatorApp,
  terminalApp,
  t3codeApp,
  paseoApp,
  converseApp,
  filesApp,
  musicApp,
  nightscoutApp,
  transcribeApp,
  teleprompterApp,
  microphonesApp,
  notificationsApp,
  calendarApp,
  weatherApp,
  navigateApp,
  compassApp,
  roamApp,
  blocksApp,
  minesweeperApp,
  freecellApp,
  pinballApp,
  flappyApp,
  developerApp,
  evenhubApp,
  glanceboardApp,
  settingsApp,
];
