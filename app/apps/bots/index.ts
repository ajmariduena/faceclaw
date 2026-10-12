import type { AppDefinition } from "../app-definition";
import { grokBotHub } from "../../assistant/grokbot/grokbot";
import { botsWakeOnReplySetting } from "../../ui/dashboard-settings";
import { buildSoundSequencePayload } from "../../ui/sound-effects";
import { shell } from "../../ui/shell/shell";
import { launchBots } from "./bots-app";

const REPLY_BUZZ = buildSoundSequencePayload([{ freq: 1200, ms: 90 }]);

function buzz(play: (payload: Uint8Array) => Promise<void> | void): void {
  try {
    void Promise.resolve(play(REPLY_BUZZ)).catch((error) => console.warn(`bots buzz failed: ${error}`));
  } catch (error) {
    console.warn(`bots buzz failed: ${error}`);
  }
}

const botsApp: AppDefinition = {
  appId: "bots",
  title: "Grok Bot",
  icon: "sparkles",
  boot: (ctx) => {
    grokBotHub.onReply(() => {
      if (!botsWakeOnReplySetting.get()) return;
      buzz(payload => ctx.actions.playBuzzerSequence(payload));
      if (shell.isScreenOn()) return;
      shell.wake("window");
      void ctx.launchApp("bots").catch((error) => console.warn(`bots wake failed: ${error}`));
    });
    grokBotHub.start();
  },
  launch: (ctx) => launchBots(ctx),
};
export default botsApp;
