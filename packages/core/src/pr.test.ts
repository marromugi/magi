import { mock, describe, test, expect, beforeEach, afterEach } from "bun:test";

mock.module("./webhook.js", () => ({
  sendWebhook: mock(() => {}),
}));

import { createIssue, updateIssue, getIssue, type Issue } from "./issue.js";
import {
  listPRQueue,
  createIssuePR,
  mergeIssuePR,
  isPRMerged,
  processPRQueue,
} from "./pr.js";
import { closeDb, getDb, migrate } from "./db.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeExec(result: { stdout: string; exitCode: number }) {
  return mock((_cmd: string, _args: string[]) => result);
}

describe("listPRQueue", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    closeDb();
    tmpDir = await mkdtemp(join(tmpdir(), "magi-pr-test-"));
    dbPath = join(tmpDir, "test.db");
    migrate(dbPath);
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("returns empty array when no implemented issues", () => {
    createIssue(dbPath, { title: "A", type: "feat", acceptance: "ok" });
    expect(listPRQueue(dbPath)).toEqual([]);
  });

  test("returns single implemented issue", () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, issue.id, { status: "implemented" });
    const result = listPRQueue(dbPath) as Issue[];
    expect(result).toHaveLength(1);
  });

  test("returns multiple issues with no deps sorted by ID", () => {
    const a = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });
    const b = createIssue(dbPath, {
      title: "B",
      type: "feat",
      acceptance: "ok",
    });
    const c = createIssue(dbPath, {
      title: "C",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, a.id, { status: "implemented" });
    updateIssue(dbPath, b.id, { status: "implemented" });
    updateIssue(dbPath, c.id, { status: "implemented" });
    const result = listPRQueue(dbPath) as Issue[];
    expect(result.map((i) => i.id)).toEqual([a.id, b.id, c.id]);
  });

  test("dependency comes before dependent", () => {
    const dep = createIssue(dbPath, {
      title: "dep",
      type: "feat",
      acceptance: "ok",
    });
    const main = createIssue(dbPath, {
      title: "main",
      type: "feat",
      acceptance: "ok",
      depends_on: [dep.id],
    });
    updateIssue(dbPath, dep.id, { status: "implemented" });
    updateIssue(dbPath, main.id, { status: "implemented" });
    const result = listPRQueue(dbPath) as Issue[];
    const ids = result.map((i) => i.id);
    expect(ids.indexOf(dep.id)).toBeLessThan(ids.indexOf(main.id));
  });

  test("handles chain A depends on B depends on C", () => {
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
    updateIssue(dbPath, a.id, { status: "implemented" });
    updateIssue(dbPath, b.id, { status: "implemented" });
    updateIssue(dbPath, c.id, { status: "implemented" });
    const result = listPRQueue(dbPath) as Issue[];
    expect(result.map((i) => i.id)).toEqual([a.id, b.id, c.id]);
  });

  test("ignores dependency on non-implemented issue", () => {
    const done = createIssue(dbPath, {
      title: "done",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, done.id, { status: "done" });
    const impl = createIssue(dbPath, {
      title: "impl",
      type: "feat",
      acceptance: "ok",
      depends_on: [done.id],
    });
    updateIssue(dbPath, impl.id, { status: "implemented" });
    const result = listPRQueue(dbPath) as Issue[];
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(impl.id);
  });

  test("returns Error on circular dependency", () => {
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
    updateIssue(dbPath, a.id, { status: "implemented" });
    updateIssue(dbPath, b.id, { status: "implemented" });
    // Bypass addDependency's cycle check to inject circular dep directly
    getDb(dbPath).run("UPDATE issues SET depends_on = ? WHERE id = ?", [
      JSON.stringify([b.id]),
      a.id,
    ]);
    expect(listPRQueue(dbPath)).toBeInstanceOf(Error);
  });

  test("independent issues at same level sorted by ID", () => {
    const a = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });
    const b = createIssue(dbPath, {
      title: "B",
      type: "feat",
      acceptance: "ok",
    });
    const c = createIssue(dbPath, {
      title: "C",
      type: "feat",
      acceptance: "ok",
      depends_on: [a.id],
    });
    updateIssue(dbPath, a.id, { status: "implemented" });
    updateIssue(dbPath, b.id, { status: "implemented" });
    updateIssue(dbPath, c.id, { status: "implemented" });
    const result = listPRQueue(dbPath) as Issue[];
    const ids = result.map((i) => i.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(c.id));
  });
});

describe("createIssuePR", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    closeDb();
    tmpDir = await mkdtemp(join(tmpdir(), "magi-pr-test-"));
    dbPath = join(tmpDir, "test.db");
    migrate(dbPath);
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("returns Error when issue has no branch", () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, issue.id, { status: "implemented" });
    const exec = makeExec({ stdout: "", exitCode: 0 });
    expect(createIssuePR(dbPath, issue.id, exec)).toBeInstanceOf(Error);
    expect(exec).not.toHaveBeenCalled();
  });

  test("calls gh pr create and returns null on success", () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    updateIssue(dbPath, issue.id, { status: "implemented" });
    const exec = makeExec({
      stdout: "https://github.com/owner/repo/pull/1",
      exitCode: 0,
    });
    expect(createIssuePR(dbPath, issue.id, exec)).toBeNull();
    expect(exec).toHaveBeenCalledWith(
      "gh",
      expect.arrayContaining(["pr", "create"]),
    );
  });

  test("returns Error when gh pr create fails", () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    updateIssue(dbPath, issue.id, { status: "implemented" });
    const exec = makeExec({ stdout: "error", exitCode: 1 });
    expect(createIssuePR(dbPath, issue.id, exec)).toBeInstanceOf(Error);
  });

  test("uses commit_message as PR title when available", () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
      commit_message: "feat(core): add something",
    });
    updateIssue(dbPath, issue.id, { status: "implemented" });
    const capturedArgs: string[] = [];
    const exec = mock((cmd: string, args: string[]) => {
      void cmd;
      capturedArgs.push(...args);
      return { stdout: "", exitCode: 0 };
    });
    createIssuePR(dbPath, issue.id, exec);
    expect(capturedArgs).toContain("feat(core): add something");
  });

  test("uses title as PR title when commit_message is null", () => {
    const issue = createIssue(dbPath, {
      title: "My Issue",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    updateIssue(dbPath, issue.id, { status: "implemented" });
    const capturedArgs: string[] = [];
    const exec = mock((cmd: string, args: string[]) => {
      void cmd;
      capturedArgs.push(...args);
      return { stdout: "", exitCode: 0 };
    });
    createIssuePR(dbPath, issue.id, exec);
    expect(capturedArgs).toContain("My Issue");
  });
});

describe("mergeIssuePR", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    closeDb();
    tmpDir = await mkdtemp(join(tmpdir(), "magi-pr-test-"));
    dbPath = join(tmpDir, "test.db");
    migrate(dbPath);
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("returns Error when issue has no branch", () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });
    const exec = makeExec({ stdout: "", exitCode: 0 });
    expect(mergeIssuePR(dbPath, issue.id, exec)).toBeInstanceOf(Error);
    expect(exec).not.toHaveBeenCalled();
  });

  test("calls gh pr merge and returns null on success", () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    const exec = makeExec({ stdout: "", exitCode: 0 });
    expect(mergeIssuePR(dbPath, issue.id, exec)).toBeNull();
    expect(exec).toHaveBeenCalledWith(
      "gh",
      expect.arrayContaining(["pr", "merge"]),
    );
  });

  test("returns Error when gh pr merge fails", () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    const exec = makeExec({ stdout: "error", exitCode: 1 });
    expect(mergeIssuePR(dbPath, issue.id, exec)).toBeInstanceOf(Error);
  });
});

describe("isPRMerged", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    closeDb();
    tmpDir = await mkdtemp(join(tmpdir(), "magi-pr-test-"));
    dbPath = join(tmpDir, "test.db");
    migrate(dbPath);
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("returns false when issue has no branch", () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });
    const exec = makeExec({ stdout: "MERGED", exitCode: 0 });
    expect(isPRMerged(dbPath, issue.id, exec)).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  test("returns true when PR state is MERGED", () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    const exec = makeExec({ stdout: "MERGED\n", exitCode: 0 });
    expect(isPRMerged(dbPath, issue.id, exec)).toBe(true);
  });

  test("returns false when PR state is OPEN", () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    const exec = makeExec({ stdout: "OPEN\n", exitCode: 0 });
    expect(isPRMerged(dbPath, issue.id, exec)).toBe(false);
  });

  test("returns false when PR state is CLOSED", () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    const exec = makeExec({ stdout: "CLOSED\n", exitCode: 0 });
    expect(isPRMerged(dbPath, issue.id, exec)).toBe(false);
  });
});

describe("processPRQueue", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    closeDb();
    tmpDir = await mkdtemp(join(tmpdir(), "magi-pr-test-"));
    dbPath = join(tmpDir, "test.db");
    migrate(dbPath);
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true, force: true });
  });

  const noop = {
    rebase: () => null as Error | null,
    createPR: () => null as Error | null,
    mergePR: () => null as Error | null,
    checkMerged: () => false,
    listQueue: () => [] as Issue[],
    listInReview: () => [] as Issue[],
    update: (d: string, id: number, inp: Parameters<typeof updateIssue>[2]) =>
      updateIssue(d, id, inp),
  };

  test("does nothing when queue is empty", async () => {
    const createPR = mock(() => null as Error | null);
    await processPRQueue({ dbPath, autoMerge: false }, { ...noop, createPR });
    expect(createPR).not.toHaveBeenCalled();
  });

  test("auto-merge: rebase → create PR → merge → done", async () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    updateIssue(dbPath, issue.id, { status: "implemented" });
    const updated = getIssue(dbPath, issue.id)!;

    const calls: string[] = [];
    await processPRQueue(
      { dbPath, autoMerge: true },
      {
        ...noop,
        listQueue: () => [updated],
        rebase: () => {
          calls.push("rebase");
          return null;
        },
        createPR: () => {
          calls.push("createPR");
          return null;
        },
        mergePR: () => {
          calls.push("mergePR");
          return null;
        },
      },
    );

    expect(calls).toEqual(["rebase", "createPR", "mergePR"]);
    expect(getIssue(dbPath, issue.id)?.status).toBe("done");
  });

  test("manual: rebase → create PR → in-review (no merge call)", async () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    updateIssue(dbPath, issue.id, { status: "implemented" });
    const updated = getIssue(dbPath, issue.id)!;

    const mergePR = mock(() => null as Error | null);
    await processPRQueue(
      { dbPath, autoMerge: false },
      { ...noop, listQueue: () => [updated], mergePR },
    );

    expect(mergePR).not.toHaveBeenCalled();
    expect(getIssue(dbPath, issue.id)?.status).toBe("in-review");
  });

  test("skips processing new issues when in-review issue exists and not merged", async () => {
    const inReviewIssue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    updateIssue(dbPath, inReviewIssue.id, { status: "in-review" });
    const nextIssue = createIssue(dbPath, {
      title: "B",
      type: "feat",
      acceptance: "ok",
      branch: "feat/b",
    });
    updateIssue(dbPath, nextIssue.id, { status: "implemented" });

    const inReview = getIssue(dbPath, inReviewIssue.id)!;
    const next = getIssue(dbPath, nextIssue.id)!;
    const createPR = mock(() => null as Error | null);

    await processPRQueue(
      { dbPath, autoMerge: false },
      {
        ...noop,
        listInReview: () => [inReview],
        listQueue: () => [next],
        checkMerged: () => false,
        createPR,
      },
    );

    expect(createPR).not.toHaveBeenCalled();
    expect(getIssue(dbPath, nextIssue.id)?.status).toBe("implemented");
  });

  test("marks done when in-review issue is merged", async () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    updateIssue(dbPath, issue.id, { status: "in-review" });
    const inReview = getIssue(dbPath, issue.id)!;

    await processPRQueue(
      { dbPath, autoMerge: false },
      {
        ...noop,
        listInReview: () => [inReview],
        checkMerged: () => true,
      },
    );

    expect(getIssue(dbPath, issue.id)?.status).toBe("done");
  });

  test("skips and marks blocked on rebase error", async () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    updateIssue(dbPath, issue.id, { status: "implemented" });
    const updated = getIssue(dbPath, issue.id)!;

    const createPR = mock(() => null as Error | null);
    await processPRQueue(
      { dbPath, autoMerge: false },
      {
        ...noop,
        listQueue: () => [updated],
        rebase: (d, id) => {
          updateIssue(d, id, { status: "blocked" });
          return new Error("Rebase conflict");
        },
        createPR,
      },
    );

    expect(createPR).not.toHaveBeenCalled();
    expect(getIssue(dbPath, issue.id)?.status).toBe("blocked");
  });

  test("marks blocked on PR creation error", async () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    updateIssue(dbPath, issue.id, { status: "implemented" });
    const updated = getIssue(dbPath, issue.id)!;

    await processPRQueue(
      { dbPath, autoMerge: true },
      {
        ...noop,
        listQueue: () => [updated],
        createPR: () => new Error("PR creation failed"),
      },
    );

    expect(getIssue(dbPath, issue.id)?.status).toBe("blocked");
  });

  test("auto-merge: marks blocked on merge error", async () => {
    const issue = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
      branch: "feat/a",
    });
    updateIssue(dbPath, issue.id, { status: "implemented" });
    const updated = getIssue(dbPath, issue.id)!;

    await processPRQueue(
      { dbPath, autoMerge: true },
      {
        ...noop,
        listQueue: () => [updated],
        mergePR: () => new Error("merge failed"),
      },
    );

    expect(getIssue(dbPath, issue.id)?.status).toBe("blocked");
  });

  test("skips when listPRQueue returns Error", async () => {
    const createPR = mock(() => null as Error | null);
    await processPRQueue(
      { dbPath, autoMerge: false },
      {
        ...noop,
        listQueue: () => new Error("circular dependency"),
        createPR,
      },
    );
    expect(createPR).not.toHaveBeenCalled();
  });
});
