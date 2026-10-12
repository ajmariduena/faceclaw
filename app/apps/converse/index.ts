import type { AppDefinition } from "../app-definition";
import { CONVERSE_SURFACE_ID, CONVERSE_WINDOW_ID, createConverseWindow } from "./converse-app";

/** Live facts during a conversation (research/conversar/plan.md). */
const converseApp: AppDefinition = {
  appId: "converse",
  title: "Converse",
  icon: "message-circle",
  launch: (ctx) => ctx.launchInProcessApp(CONVERSE_WINDOW_ID, CONVERSE_SURFACE_ID, createConverseWindow),
};
export default converseApp;
