import type { AppDefinition } from "../app-definition";
import { shell } from "../../ui/shell/shell";
import { createHomeWindow } from "./home-app";
import { applyHomeLayout } from "./home-layout";

const homeApp: AppDefinition = {
  appId: "home",
  title: "Inicio",
  icon: "layout-grid",
  showInLauncher: false,
  boot: ctx => {
    applyHomeLayout();
    const home = createHomeWindow(ctx);
    shell.registerHomeWindow(home.window, home.onShow);
  },
  launch: async () => { shell.showHome(); },
};
export default homeApp;
