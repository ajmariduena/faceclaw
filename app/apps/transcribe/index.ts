import { type AppDefinition } from "../app-definition";
import { createTranscribeAppWindow, TRANSCRIBE_SURFACE_ID, TRANSCRIBE_WINDOW_ID } from "./transcribe-app";

const transcribeApp: AppDefinition = {
  appId: "transcribe",
  title: "Transcribe",
  icon: "mic",
  launch: (ctx) =>
    ctx.launchInProcessApp(TRANSCRIBE_WINDOW_ID, TRANSCRIBE_SURFACE_ID, (options) =>
      createTranscribeAppWindow({
        ...options,
        startContinuousVoiceCapture: () => void options.actions.startContinuousVoiceCapture("transcribe"),
        stopContinuousVoiceCapture: () => void options.actions.stopContinuousVoiceCapture("transcribe"),
      }),
    ),
};

export default transcribeApp;
