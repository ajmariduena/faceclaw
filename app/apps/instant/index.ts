import type { AppDefinition } from "../app-definition";
import { INSTANT_TITLE, launchInstant } from "./instant-app";

/** The fast assistant (research/instant-chat/plan.md); complex tasks go to Grok Bot. */
const instantApp: AppDefinition = {
  appId: "instant",
  title: INSTANT_TITLE,
  icon: "zap",
  launch: (ctx) => launchInstant(ctx),
};
export default instantApp;
