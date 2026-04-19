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
  checkDeps,
  rebaseIssueBranch,
  type ExecFnWithStatus,
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

  test("returns issue when dep is implemented and has no branch", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, dep.id, { status: "implemented" });
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

  test("returns issue when dep is in-review and has no branch", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, dep.id, { status: "in-review" });
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

describe("checkDeps", () => {
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

  test("returns blocked: false when issue has no dependencies", () => {
    const issue = createIssue(dbPath, {
      title: "T",
      type: "feat",
      acceptance: "ok",
    });
    expect(checkDeps(dbPath, issue.id)).toEqual({ blocked: false });
  });

  test("returns blocked: false when all dependencies are done", () => {
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
    expect(checkDeps(dbPath, issue.id)).toEqual({ blocked: false });
  });

  test("returns blocked: true with unresolved deps when a dependency is not done", () => {
    const dep = createIssue(dbPath, {
      title: "pending dep",
      type: "feat",
      acceptance: "ok",
    });
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    const result = checkDeps(dbPath, issue.id);
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.unresolvedDeps).toHaveLength(1);
      expect(result.unresolvedDeps[0]).toEqual({
        id: dep.id,
        title: "pending dep",
        status: "queue",
      });
    }
  });

  test("includes only unresolved deps when some are done and some are not", () => {
    const done = createIssue(dbPath, {
      title: "done dep",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, done.id, { status: "done" });
    const pending = createIssue(dbPath, {
      title: "active dep",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, pending.id, { status: "active" });
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
      depends_on: [done.id, pending.id],
    });
    const result = checkDeps(dbPath, issue.id);
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.unresolvedDeps).toHaveLength(1);
      expect(result.unresolvedDeps[0].id).toBe(pending.id);
    }
  });

  test("throws an error when issue does not exist", () => {
    expect(() => checkDeps(dbPath, 9999)).toThrow();
  });
});

describe("listReadyIssues - blocked recovery", () => {
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

  test("returns blocked issue when all deps are done and updates status to queue", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, dep.id, { status: "done" });
    const blocked = createIssue(dbPath, {
      title: "blocked",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    updateIssue(dbPath, blocked.id, { status: "blocked" });

    const exec = mock(() => "");
    const ready = listReadyIssues(dbPath, exec);

    expect(ready.map((i) => i.id)).toContain(blocked.id);
    expect(ready.find((i) => i.id === blocked.id)?.status).toBe("queue");
  });

  test("excludes blocked issue when deps are not done", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    const blocked = createIssue(dbPath, {
      title: "blocked",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    updateIssue(dbPath, blocked.id, { status: "blocked" });

    const exec = mock(() => "");
    const ready = listReadyIssues(dbPath, exec);

    expect(ready.map((i) => i.id)).not.toContain(blocked.id);
  });

  test("persists status change to queue in DB after recovery", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, dep.id, { status: "done" });
    const blocked = createIssue(dbPath, {
      title: "blocked",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    updateIssue(dbPath, blocked.id, { status: "blocked" });

    const exec = mock(() => "");
    listReadyIssues(dbPath, exec);

    const updated = getIssue(dbPath, blocked.id);
    expect(updated?.status).toBe("queue");
  });

  test("does not affect existing queue issue logic", () => {
    const queue = createIssue(dbPath, {
      title: "queue",
      type: "feat",
      acceptance: "ok",
    });
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, dep.id, { status: "done" });
    const blocked = createIssue(dbPath, {
      title: "blocked",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    updateIssue(dbPath, blocked.id, { status: "blocked" });

    const exec = mock(() => "");
    const ready = listReadyIssues(dbPath, exec);

    expect(ready.map((i) => i.id)).toContain(queue.id);
    expect(ready.map((i) => i.id)).toContain(blocked.id);
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

describe("rebaseIssueBranch", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    closeDb();
    tmpDir = await mkdtemp(join(tmpdir(), "magi-rebase-test-"));
    dbPath = join(tmpDir, "test.db");
    migrate(dbPath);
    mockSendWebhook.mockClear();
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true, force: true });
  });

  function ok(): ReturnType<ExecFnWithStatus> {
    return { stdout: "", exitCode: 0 };
  }
  function lsFound(branch: string): ReturnType<ExecFnWithStatus> {
    return { stdout: `abc123\trefs/heads/${branch}\n`, exitCode: 0 };
  }
  function rebaseFail(): ReturnType<ExecFnWithStatus> {
    return { stdout: "CONFLICT", exitCode: 1 };
  }

  test("returns null and skips exec when issue has no branch", () => {
    const issue = createIssue(dbPath, {
      title: "T",
      type: "feat",
      acceptance: "ok",
    });
    const exec = mock(() => ok());
    const result = rebaseIssueBranch(dbPath, issue.id, exec);
    expect(result).toBeNull();
    expect(exec).not.toHaveBeenCalled();
  });

  test("returns null and skips exec when issue is not found", () => {
    const exec = mock(() => ok());
    const result = rebaseIssueBranch(dbPath, 9999, exec);
    expect(result).toBeNull();
    expect(exec).not.toHaveBeenCalled();
  });

  test("skips rebase when remote branch does not exist", () => {
    const issue = createIssue(dbPath, {
      title: "T",
      type: "feat",
      acceptance: "ok",
      branch: "feat/t",
    });
    const exec = mock((cmd: string, args: string[]) => {
      if (args[0] === "ls-remote") return { stdout: "", exitCode: 0 };
      return ok();
    });
    const result = rebaseIssueBranch(dbPath, issue.id, exec);
    expect(result).toBeNull();
    const rebaseCalls = exec.mock.calls.filter(
      ([, args]: [string, string[]]) => args[0] === "rebase",
    );
    expect(rebaseCalls).toHaveLength(0);
  });

  test("calls fetch, rebase, and force push on success and returns null", () => {
    const issue = createIssue(dbPath, {
      title: "T",
      type: "feat",
      acceptance: "ok",
      branch: "feat/t",
    });
    const calls: { cmd: string; args: string[] }[] = [];
    const exec = mock((cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args[0] === "ls-remote") return lsFound("feat/t");
      return ok();
    });
    const result = rebaseIssueBranch(dbPath, issue.id, exec);
    expect(result).toBeNull();
    expect(calls).toContainEqual({ cmd: "git", args: ["fetch", "origin"] });
    expect(calls).toContainEqual({
      cmd: "git",
      args: ["rebase", "origin/main", "feat/t"],
    });
    expect(calls).toContainEqual({
      cmd: "git",
      args: ["push", "--force-with-lease", "origin", "feat/t"],
    });
  });

  test("calls rebase --abort and returns Error on conflict", () => {
    const issue = createIssue(dbPath, {
      title: "T",
      type: "feat",
      acceptance: "ok",
      branch: "feat/t",
    });
    const exec = mock((cmd: string, args: string[]) => {
      if (args[0] === "ls-remote") return lsFound("feat/t");
      if (args[0] === "rebase" && !args.includes("--abort"))
        return rebaseFail();
      return ok();
    });
    const result = rebaseIssueBranch(dbPath, issue.id, exec);
    expect(result).toBeInstanceOf(Error);
    const abortCalls = exec.mock.calls.filter(
      ([, args]: [string, string[]]) =>
        args[0] === "rebase" && args.includes("--abort"),
    );
    expect(abortCalls).toHaveLength(1);
  });

  test("updates issue status to blocked on rebase conflict", () => {
    const issue = createIssue(dbPath, {
      title: "T",
      type: "feat",
      acceptance: "ok",
      branch: "feat/t",
    });
    const exec = mock((cmd: string, args: string[]) => {
      if (args[0] === "ls-remote") return lsFound("feat/t");
      if (args[0] === "rebase" && !args.includes("--abort"))
        return rebaseFail();
      return ok();
    });
    rebaseIssueBranch(dbPath, issue.id, exec);
    const updated = getIssue(dbPath, issue.id);
    expect(updated?.status).toBe("blocked");
  });

  test("does not force push on rebase conflict", () => {
    const issue = createIssue(dbPath, {
      title: "T",
      type: "feat",
      acceptance: "ok",
      branch: "feat/t",
    });
    const exec = mock((cmd: string, args: string[]) => {
      if (args[0] === "ls-remote") return lsFound("feat/t");
      if (args[0] === "rebase" && !args.includes("--abort"))
        return rebaseFail();
      return ok();
    });
    rebaseIssueBranch(dbPath, issue.id, exec);
    const pushCalls = exec.mock.calls.filter(
      ([, args]: [string, string[]]) => args[0] === "push",
    );
    expect(pushCalls).toHaveLength(0);
  });
});

describe("failed status", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "magi-test-"));
    dbPath = join(tmpDir, "issues.db");
    migrate(dbPath);
    mockSendWebhook.mockClear();
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true });
  });

  test("updateIssue sets status to failed with failed_reason", () => {
    const issue = createIssue(dbPath, {
      title: "test",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, issue.id, {
      status: "failed",
      failed_reason: "sandbox exited with code 1",
    });
    const updated = getIssue(dbPath, issue.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.failed_reason).toBe("sandbox exited with code 1");
  });

  test("failed_reason is cleared when status changes to queue", () => {
    const issue = createIssue(dbPath, {
      title: "test",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, issue.id, {
      status: "failed",
      failed_reason: "some error",
    });
    updateIssue(dbPath, issue.id, { status: "queue" });
    const updated = getIssue(dbPath, issue.id);
    expect(updated?.status).toBe("queue");
    expect(updated?.failed_reason).toBeNull();
  });

  test("listReadyIssues excludes failed issues", () => {
    const issue = createIssue(dbPath, {
      title: "test",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, issue.id, {
      status: "failed",
      failed_reason: "error",
    });
    const noExec = () => "";
    const ready = listReadyIssues(dbPath, noExec);
    expect(ready.find((i) => i.id === issue.id)).toBeUndefined();
  });

  test("listIssues can filter by failed status", () => {
    createIssue(dbPath, {
      title: "ok",
      type: "feat",
      acceptance: "ok",
    });
    const failed = createIssue(dbPath, {
      title: "broken",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, failed.id, {
      status: "failed",
      failed_reason: "timeout",
    });
    const result = listIssues(dbPath, { status: ["failed"] });
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("broken");
    expect(result[0]!.failed_reason).toBe("timeout");
  });
});

describe("skipped status", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "magi-test-"));
    dbPath = join(tmpDir, "issues.db");
    migrate(dbPath);
    mockSendWebhook.mockClear();
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true });
  });

  test("updateIssue can set status to skipped", () => {
    const issue = createIssue(dbPath, {
      title: "test",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, issue.id, { status: "skipped" });
    const updated = getIssue(dbPath, issue.id);
    expect(updated?.status).toBe("skipped");
  });

  test("listReadyIssues excludes skipped issues", () => {
    const issue = createIssue(dbPath, {
      title: "test",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, issue.id, { status: "skipped" });
    const noExec = () => "";
    const ready = listReadyIssues(dbPath, noExec);
    expect(ready.find((i) => i.id === issue.id)).toBeUndefined();
  });

  test("listReadyIssues returns issue when dep is skipped and has no branch", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, dep.id, { status: "skipped" });
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

  test("checkDeps treats skipped dep as resolved", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, dep.id, { status: "skipped" });
    const issue = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    const result = checkDeps(dbPath, issue.id);
    expect(result.blocked).toBe(false);
  });
});
