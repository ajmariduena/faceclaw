import type { AppDefinition } from "../app-definition";
import { CONVERSE_SURFACE_ID, CONVERSE_WINDOW_ID, createConverseWindow } from "./converse-app";

/** Placeholder: the live-facts app is specified in research/conversar/plan.md but not built yet. */
const converseApp: AppDefinition = {
  appId: "converse",
  title: "Converse",
  icon: "message-circle",
  launch: (ctx) => ctx.launchInProcessApp(CONVERSE_WINDOW_ID, CONVERSE_SURFACE_ID, createConverseWindow),
};
export default converseApp;
