import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { migrate, createIssue, updateIssue, closeDb } from "@magi/core";

const CLI_PATH = join(import.meta.dir, "index.ts");

describe("check-deps command", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    closeDb();
    tmpDir = await mkdtemp(join(tmpdir(), "magi-check-deps-test-"));
    dbPath = join(tmpDir, "test.db");
    migrate(dbPath);
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("exits 0 when issue has no dependencies", () => {
    const issue = createIssue(dbPath, {
      title: "standalone issue",
      type: "feat",
      acceptance: "done",
    });

    const result = Bun.spawnSync(
      ["bun", CLI_PATH, "check-deps", String(issue.id)],
      { env: { ...process.env, MAGI_DB_PATH: dbPath } },
    );

    expect(result.exitCode).toBe(0);
  });

  test("exits 0 when all dependencies are done", () => {
    const dep = createIssue(dbPath, {
      title: "finished dep",
      type: "feat",
      acceptance: "done",
    });
    updateIssue(dbPath, dep.id, { status: "done" });
    const issue = createIssue(dbPath, {
      title: "blocked issue",
      type: "feat",
      acceptance: "done",
      depends_on: [dep.id],
    });

    const result = Bun.spawnSync(
      ["bun", CLI_PATH, "check-deps", String(issue.id)],
      { env: { ...process.env, MAGI_DB_PATH: dbPath } },
    );

    expect(result.exitCode).toBe(0);
  });

  test("exits 2 when issue has unresolved dependencies", () => {
    const dep = createIssue(dbPath, {
      title: "pending dep",
      type: "feat",
      acceptance: "done",
    });
    const issue = createIssue(dbPath, {
      title: "blocked issue",
      type: "feat",
      acceptance: "done",
      depends_on: [dep.id],
    });

    const result = Bun.spawnSync(
      ["bun", CLI_PATH, "check-deps", String(issue.id)],
      { env: { ...process.env, MAGI_DB_PATH: dbPath } },
    );

    expect(result.exitCode).toBe(2);
  });

  test("output includes unresolved dep id and title when blocked", () => {
    const dep = createIssue(dbPath, {
      title: "pending dep",
      type: "feat",
      acceptance: "done",
    });
    const issue = createIssue(dbPath, {
      title: "blocked issue",
      type: "feat",
      acceptance: "done",
      depends_on: [dep.id],
    });

    const result = Bun.spawnSync(
      ["bun", CLI_PATH, "check-deps", String(issue.id)],
      { env: { ...process.env, MAGI_DB_PATH: dbPath } },
    );

    const stdout = result.stdout.toString();
    expect(stdout).toContain(String(dep.id));
    expect(stdout).toContain("pending dep");
  });

  test("output includes commit instruction when blocked", () => {
    const dep = createIssue(dbPath, {
      title: "pending dep",
      type: "feat",
      acceptance: "done",
    });
    const issue = createIssue(dbPath, {
      title: "blocked issue",
      type: "feat",
      acceptance: "done",
      depends_on: [dep.id],
    });

    const result = Bun.spawnSync(
      ["bun", CLI_PATH, "check-deps", String(issue.id)],
      { env: { ...process.env, MAGI_DB_PATH: dbPath } },
    );

    const stdout = result.stdout.toString();
    expect(stdout).toContain(
      "セッションを中断し、作業内容をコミットしてください",
    );
  });

  test("reads issue ID from MAGI_ISSUE_ID env when called without args (hook mode)", () => {
    const dep = createIssue(dbPath, {
      title: "pending dep",
      type: "feat",
      acceptance: "done",
    });
    const issue = createIssue(dbPath, {
      title: "blocked issue",
      type: "feat",
      acceptance: "done",
      depends_on: [dep.id],
    });

    const hookJson = JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: "/some/file.ts", content: "x" },
    });

    const result = Bun.spawnSync(["bun", CLI_PATH, "check-deps"], {
      env: {
        ...process.env,
        MAGI_DB_PATH: dbPath,
        MAGI_ISSUE_ID: String(issue.id),
      },
      stdin: new TextEncoder().encode(hookJson),
    });

    expect(result.exitCode).toBe(2);
  });

  test("exits 0 when called without args and no MAGI_ISSUE_ID (hook pass-through)", () => {
    const envWithoutIssueId = { ...(process.env as Record<string, string>) };
    delete envWithoutIssueId.MAGI_ISSUE_ID;

    const hookJson = JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: "/some/file.ts", content: "x" },
    });

    const result = Bun.spawnSync(["bun", CLI_PATH, "check-deps"], {
      env: { ...envWithoutIssueId, MAGI_DB_PATH: dbPath },
      stdin: new TextEncoder().encode(hookJson),
    });

    expect(result.exitCode).toBe(0);
  });

  test("exits 1 when issue does not exist", () => {
    const result = Bun.spawnSync(["bun", CLI_PATH, "check-deps", "99999"], {
      env: { ...process.env, MAGI_DB_PATH: dbPath },
    });

    expect(result.exitCode).toBe(1);
  });
});
