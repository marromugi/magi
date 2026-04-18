import { mock, describe, test, expect, beforeEach, afterEach } from "bun:test";
import type { Mock } from "bun:test";

mock.module("./webhook.js", () => ({
  sendWebhook: mock(() => {}),
}));

import {
  createIssue,
  getIssue,
  listIssues,
  updateIssue,
  listReadyIssues,
  addDependency,
} from "./issue.js";
import { sendWebhook } from "./webhook.js";
import { closeDb, migrate } from "./db.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mockSendWebhook = sendWebhook as unknown as Mock<typeof sendWebhook>;

describe("listReadyIssues", () => {
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

  test("returns queue issues with no dependencies without calling exec", () => {
    createIssue(dbPath, { title: "T", type: "feat", acceptance: "ok" });
    const exec = mock(() => "");
    const ready = listReadyIssues(dbPath, exec);
    expect(ready).toHaveLength(1);
    expect(exec).not.toHaveBeenCalled();
  });

  test("returns issue when all deps are done and have no branch", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, dep.id, { status: "done" });
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    const exec = mock(() => "");
    const ready = listReadyIssues(dbPath, exec);
    expect(ready.map((i) => i.id)).toContain(issue.id);
    expect(exec).not.toHaveBeenCalled();
  });

  test("excludes issue when dep is not done", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    const exec = mock(() => "");
    const ready = listReadyIssues(dbPath, exec);
    expect(ready.map((i) => i.id)).not.toContain(issue.id);
  });

  test("returns issue when dep is done and remote branch is gone", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
      branch: "feat/dep",
    });
    updateIssue(dbPath, dep.id, { status: "done" });
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    const exec = mock(() => "");
    const ready = listReadyIssues(dbPath, exec);
    expect(ready.map((i) => i.id)).toContain(issue.id);
  });

  test("excludes issue when dep is done but branch still exists on remote", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
      branch: "feat/dep",
    });
    updateIssue(dbPath, dep.id, { status: "done" });
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    const exec = mock((cmd: string, args: string[]) => {
      if (args[0] === "ls-remote") return "abc123\trefs/heads/feat/dep\n";
      return "";
    });
    const ready = listReadyIssues(dbPath, exec);
    expect(ready.map((i) => i.id)).not.toContain(issue.id);
  });

  test("runs git fetch --prune origin before ls-remote", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
      branch: "feat/dep",
    });
    updateIssue(dbPath, dep.id, { status: "done" });
    createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const exec = mock((cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return "";
    });
    listReadyIssues(dbPath, exec);
    expect(calls[0]).toEqual({
      cmd: "git",
      args: ["fetch", "--prune", "origin"],
    });
    expect(calls[1]).toEqual({
      cmd: "git",
      args: ["ls-remote", "--heads", "origin", "feat/dep"],
    });
  });

  test("runs git fetch only once even with multiple branched deps", () => {
    const dep1 = createIssue(dbPath, {
      title: "dep1",
      type: "feat",
      acceptance: "ok",
      branch: "feat/dep1",
    });
    updateIssue(dbPath, dep1.id, { status: "done" });
    const dep2 = createIssue(dbPath, {
      title: "dep2",
      type: "feat",
      acceptance: "ok",
      branch: "feat/dep2",
    });
    updateIssue(dbPath, dep2.id, { status: "done" });
    createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep1.id, dep2.id],
    });
    const exec = mock(() => "");
    listReadyIssues(dbPath, exec);
    const fetchCalls = exec.mock.calls.filter(
      ([, args]: [string, string[]]) => args[0] === "fetch",
    );
    expect(fetchCalls).toHaveLength(1);
  });
});

describe("addDependency", () => {
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

  test("adds depId to issue's depends_on", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
    });
    const result = addDependency(dbPath, issue.id, dep.id);
    expect(JSON.parse(result.depends_on)).toContain(dep.id);
  });

  test("returns error if depId already in depends_on", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    expect(() => addDependency(dbPath, issue.id, dep.id)).toThrow();
  });

  test("returns error if depId issue does not exist", () => {
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
    });
    expect(() => addDependency(dbPath, issue.id, 9999)).toThrow();
  });

  test("returns error if issueId equals depId (self-dependency)", () => {
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
    });
    expect(() => addDependency(dbPath, issue.id, issue.id)).toThrow();
  });

  test("returns error if adding dep would create circular dependency", () => {
    // A depends on B; adding A as dep of B would cycle
    const a = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });
    const b = createIssue(dbPath, {
      title: "B",
      type: "feat",
      acceptance: "ok",
      depends_on: [a.id],
    });
    expect(() => addDependency(dbPath, a.id, b.id)).toThrow();
  });

  test("returns error if adding dep would create indirect circular dependency", () => {
    // A → B → C; adding A as dep of C would cycle
    const a = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });
    const b = createIssue(dbPath, {
      title: "B",
      type: "feat",
      acceptance: "ok",
      depends_on: [a.id],
    });
    const c = createIssue(dbPath, {
      title: "C",
      type: "feat",
      acceptance: "ok",
      depends_on: [b.id],
    });
    expect(() => addDependency(dbPath, a.id, c.id)).toThrow();
  });

  test("changes status to blocked when issue is active", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, issue.id, { status: "active" });
    const result = addDependency(dbPath, issue.id, dep.id);
    expect(result.status).toBe("blocked");
  });

  test("returns error if issue is done", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, issue.id, { status: "done" });
    expect(() => addDependency(dbPath, issue.id, dep.id)).toThrow();
  });
});

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

describe("session_id", () => {
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

  test("session_id is null by default on createIssue", () => {
    const issue = createIssue(dbPath, {
      title: "T",
      type: "feat",
      acceptance: "ok",
    });
    expect(issue.session_id).toBeNull();
  });

  test("getIssue returns session_id", () => {
    const created = createIssue(dbPath, {
      title: "T",
      type: "feat",
      acceptance: "ok",
    });
    const fetched = getIssue(dbPath, created.id);
    expect(fetched).not.toBeNull();
    expect("session_id" in fetched!).toBe(true);
  });

  test("listIssues returns session_id on each issue", () => {
    createIssue(dbPath, { title: "T", type: "feat", acceptance: "ok" });
    const issues = listIssues(dbPath);
    expect(issues).toHaveLength(1);
    expect("session_id" in issues[0]).toBe(true);
  });

  test("updateIssue can set session_id", () => {
    const issue = createIssue(dbPath, {
      title: "T",
      type: "feat",
      acceptance: "ok",
    });
    const updated = updateIssue(dbPath, issue.id, {
      session_id: "ses_abc123",
    });
    expect(updated?.session_id).toBe("ses_abc123");
  });

  test("updateIssue can clear session_id to null", () => {
    const issue = createIssue(dbPath, {
      title: "T",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, issue.id, { session_id: "ses_abc123" });
    const cleared = updateIssue(dbPath, issue.id, { session_id: null });
    expect(cleared?.session_id).toBeNull();
  });
});
