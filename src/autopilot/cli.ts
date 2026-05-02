import { runDetectDeferralFromStdin } from "./detect-deferral-handler.js";

export async function autopilotCli(action = process.argv[3]): Promise<void> {
  switch (action) {
    case "detect-deferral":
      await runDetectDeferralFromStdin();
      return;
    default:
      process.exit(1);
  }
}
