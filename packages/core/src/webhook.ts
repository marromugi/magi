import type { Issue } from "./issue.js";

export type WebhookEvent = "issue.created" | "issue.updated";

export interface WebhookPayload {
  event: WebhookEvent;
  issue: Issue;
}

export function sendWebhook(payload: WebhookPayload): void {
  const url =
    process.env.MAGI_WEBHOOK_URL ?? "http://localhost:3000/api/webhook";
  globalThis
    .fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    .catch(() => {});
}
