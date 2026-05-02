import { runDetectDeferralFromStdin } from "./detect-deferral-handler.js";
import { runInterceptAskFromStdin } from "./intercept-ask-handler.js";
import { runAutopilotPromptFromStdin } from "./prompt-handler.js";
import { runWakeUpFromStdin } from "./wake-up-handler.js";

export async function autopilotCli(action = process.argv[3]): Promise<void> {
  switch (action) {
    case "detect-deferral":
      await runDetectDeferralFromStdin();
      return;
    case "intercept-ask":
      await runInterceptAskFromStdin();
      return;
    case "prompt":
      await runAutopilotPromptFromStdin();
      return;
    case "wake-up":
      await runWakeUpFromStdin();
      return;
    default:
      process.exit(1);
  }
}
