import { mock, describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { Mock } from "bun:test";

mock.module("./webhook.js", () => ({
  sendWebhook: mock(() => {}),
}));

import { createIssue, updateIssue } from "./issue.js";
import { sendWebhook } from "./webhook.js";
import { closeDb, migrate } from "./db.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mockSendWebhook = sendWebhook as unknown as Mock<typeof sendWebhook>;

describe("createIssue webhook", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    closeDb();
    tmpDir = await mkdtemp(join(tmpdir(), "magi-issue-test-"));
    dbPath = join(tmpDir, "test.db");
    migrate(dbPath);
    mockSendWebhook.mockClear();
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("sends issue.created webhook after create", () => {
    const issue = createIssue(dbPath, {
      title: "New Feature",
      type: "feat",
      acceptance: "feature works",
    });
    expect(mockSendWebhook).toHaveBeenCalledTimes(1);
    expect(mockSendWebhook).toHaveBeenCalledWith({
      event: "issue.created",
      issue,
    });
  });

  test("sends issue.updated webhook after update", () => {
    const issue = createIssue(dbPath, {
      title: "Bug Fix",
      type: "fix",
      acceptance: "bug fixed",
    });
    mockSendWebhook.mockClear();

    const updated = updateIssue(dbPath, issue.id, { status: "active" });
    expect(mockSendWebhook).toHaveBeenCalledTimes(1);
    expect(mockSendWebhook).toHaveBeenCalledWith({
      event: "issue.updated",
      issue: updated,
    });
  });

  test("does not send webhook when updateIssue has no fields", () => {
    const issue = createIssue(dbPath, {
      title: "Task",
      type: "chore",
      acceptance: "done",
    });
    mockSendWebhook.mockClear();

    updateIssue(dbPath, issue.id, {});
    expect(mockSendWebhook).not.toHaveBeenCalled();
  });
});
