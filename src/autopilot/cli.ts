import { runDetectDeferralFromStdin } from "./detect-deferral-handler.js";
import { runInterceptAskFromStdin } from "./intercept-ask-handler.js";

export async function autopilotCli(action = process.argv[3]): Promise<void> {
  switch (action) {
    case "detect-deferral":
      await runDetectDeferralFromStdin();
      return;
    case "intercept-ask":
      await runInterceptAskFromStdin();
      return;
    default:
      process.exit(1);
  }
}
