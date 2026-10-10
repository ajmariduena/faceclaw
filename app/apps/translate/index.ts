import { type AppDefinition } from "../app-definition";
import { createTranslateAppWindow, TRANSLATE_SURFACE_ID, TRANSLATE_WINDOW_ID } from "./translate-app";

const translateApp: AppDefinition = {
  appId: "translate",
  title: "Translate",
  icon: "mic",
  launch: (ctx) => ctx.launchInProcessApp(TRANSLATE_WINDOW_ID, TRANSLATE_SURFACE_ID, createTranslateAppWindow),
};

export default translateApp;
