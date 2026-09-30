// Alerts for failed syncs and days without puzzles. Posts to ALERT_WEBHOOK_URL
// (Discord/Slack-compatible JSON) when configured, and always logs.
import { config } from "./config";

export async function alert(message: string): Promise<void> {
  console.error(`[guesslock:alert] ${message}`);
  if (!config.alertWebhookUrl) return;
  try {
    await fetch(config.alertWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: `GUESSLOCK: ${message}`, text: `GUESSLOCK: ${message}` }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    console.error("[guesslock:alert] webhook failed", e);
  }
}
