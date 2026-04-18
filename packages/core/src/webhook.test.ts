import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { sendWebhook } from "./webhook.js";
import type { Issue } from "./issue.js";

const DEFAULT_URL = "http://localhost:3000/api/webhook";

const stubIssue: Issue = {
  id: 1,
  title: "Test",
  type: "feat",
  priority: "normal",
  status: "queue",
  depends_on: "[]",
  affects: "[]",
  acceptance: "it works",
  context: null,
  branch: null,
  commit_message: null,
  worktree_path: null,
  created_at: "2026-01-01 00:00:00",
  updated_at: "2026-01-01 00:00:00",
};

describe("sendWebhook", () => {
  let originalFetch: typeof globalThis.fetch;
  let savedUrl: string | undefined;
  let fetchMock: ReturnType<typeof mock>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    savedUrl = process.env.MAGI_WEBHOOK_URL;
    delete process.env.MAGI_WEBHOOK_URL;
    fetchMock = mock(() =>
      Promise.resolve(new Response("ok", { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (savedUrl !== undefined) {
      process.env.MAGI_WEBHOOK_URL = savedUrl;
    } else {
      delete process.env.MAGI_WEBHOOK_URL;
    }
  });

  test("sends POST to default URL with payload", async () => {
    const payload = { event: "issue.created" as const, issue: stubIssue };
    sendWebhook(payload);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(DEFAULT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  });

  test("uses MAGI_WEBHOOK_URL env var when set", async () => {
    const customUrl = "http://custom-host:9000/webhook";
    process.env.MAGI_WEBHOOK_URL = customUrl;
    const payload = { event: "issue.updated" as const, issue: stubIssue };
    sendWebhook(payload);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledWith(customUrl, expect.anything());
  });

  test("does not throw when server is unavailable", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("ECONNREFUSED")),
    ) as unknown as typeof fetch;
    const payload = { event: "issue.created" as const, issue: stubIssue };
    expect(() => sendWebhook(payload)).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });

  test("returns void immediately without awaiting fetch", () => {
    let resolved = false;
    globalThis.fetch = mock(
      () =>
        new Promise((r) =>
          setTimeout(() => {
            resolved = true;
            r(new Response("ok"));
          }, 500),
        ),
    ) as unknown as typeof fetch;
    const payload = { event: "issue.created" as const, issue: stubIssue };
    const start = Date.now();
    sendWebhook(payload);
    expect(Date.now() - start).toBeLessThan(100);
    expect(resolved).toBe(false);
  });
});
