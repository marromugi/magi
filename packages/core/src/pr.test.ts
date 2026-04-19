import { mock, describe, test, expect, beforeEach, afterEach } from "bun:test";

mock.module("./webhook.js", () => ({
  sendWebhook: mock(() => {}),
}));

import { createIssue, updateIssue, type Issue } from "./issue.js";
import { listPRQueue } from "./pr.js";
import { closeDb, getDb, migrate } from "./db.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
