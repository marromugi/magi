import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrate, createIssue, updateIssue, closeDb } from "@magi/core";

function runCli(args: string[], dbPath: string) {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", join(import.meta.dir, "index.ts"), ...args],
    env: { ...process.env, MAGI_DB_PATH: dbPath },
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode ?? 0,
  };
}

describe("pr list", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    closeDb();
    tmpDir = await mkdtemp(join(tmpdir(), "magi-cli-pr-test-"));
    dbPath = join(tmpDir, "test.db");
    migrate(dbPath);
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("shows message when no implemented issues exist", () => {
    const result = runCli(["pr", "list"], dbPath);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("implemented な issue がありません");
  });

  test("shows implemented issues with order, id, title, branch", () => {
    const issue = createIssue(dbPath, {
      title: "Add login feature",
      type: "feat",
      acceptance: "ok",
      branch: "feat/login",
    });
    updateIssue(dbPath, issue.id, { status: "implemented" });

    const result = runCli(["pr", "list"], dbPath);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(String(issue.id));
    expect(result.stdout).toContain("Add login feature");
    expect(result.stdout).toContain("feat/login");
  });

  test("shows issues in topological order with correct order numbers", () => {
    const issueA = createIssue(dbPath, {
      title: "Base feature",
      type: "feat",
      acceptance: "ok",
      branch: "feat/base",
    });
    const issueB = createIssue(dbPath, {
      title: "Dependent feature",
      type: "feat",
      acceptance: "ok",
      branch: "feat/dependent",
      depends_on: [issueA.id],
    });
    updateIssue(dbPath, issueA.id, { status: "implemented" });
    updateIssue(dbPath, issueB.id, { status: "implemented" });

    const result = runCli(["pr", "list"], dbPath);

    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trim().split("\n");
    const issueALine = lines.find((l) => l.includes("Base feature"))!;
    const issueBLine = lines.find((l) => l.includes("Dependent feature"))!;
    expect(issueALine).toBeDefined();
    expect(issueBLine).toBeDefined();
    // A (no deps) should appear before B (depends on A)
    expect(lines.indexOf(issueALine)).toBeLessThan(lines.indexOf(issueBLine));
    // A should be order 1, B should be order 2
    expect(issueALine).toContain("1");
    expect(issueBLine).toContain("2");
  });

  test("does not show non-implemented issues", () => {
    const queueIssue = createIssue(dbPath, {
      title: "Queue issue",
      type: "feat",
      acceptance: "ok",
    });
    const implIssue = createIssue(dbPath, {
      title: "Implemented issue",
      type: "feat",
      acceptance: "ok",
      branch: "feat/impl",
    });
    updateIssue(dbPath, implIssue.id, { status: "implemented" });

    const result = runCli(["pr", "list"], dbPath);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Implemented issue");
    expect(result.stdout).not.toContain("Queue issue");
    void queueIssue;
  });
});
