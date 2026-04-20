import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { migrate, createIssue, updateIssue, closeDb } from "@magi/core";
import { parseDaemonFlags } from "./index.js";

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

describe("parseDaemonFlags", () => {
  test("enables review and PR by default", () => {
    const result = parseDaemonFlags([]);
    expect(result.withReview).toBe(true);
    expect(result.withPR).toBe(true);
  });

  test("disables review with --no-review", () => {
    const result = parseDaemonFlags(["--no-review"]);
    expect(result.withReview).toBe(false);
  });

  test("disables PR with --no-pr", () => {
    const result = parseDaemonFlags(["--no-pr"]);
    expect(result.withPR).toBe(false);
  });

  test("keeps auto-merge false by default", () => {
    const result = parseDaemonFlags([]);
    expect(result.autoMerge).toBe(false);
  });

  test("enables auto-merge with --auto-merge", () => {
    const result = parseDaemonFlags(["--auto-merge"]);
    expect(result.autoMerge).toBe(true);
  });

  test("disables both review and PR together", () => {
    const result = parseDaemonFlags(["--no-review", "--no-pr"]);
    expect(result.withReview).toBe(false);
    expect(result.withPR).toBe(false);
  });
});

describe("issue add-dep", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    closeDb();
    tmpDir = await mkdtemp(join(tmpdir(), "magi-cli-test-"));
    dbPath = join(tmpDir, "test.db");
    migrate(dbPath);
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("adds dependency and shows updated issue as JSON", () => {
    const issue1 = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });
    const issue2 = createIssue(dbPath, {
      title: "B",
      type: "feat",
      acceptance: "ok",
    });

    const result = runCli(
      ["issue", "add-dep", String(issue1.id), String(issue2.id)],
      dbPath,
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(JSON.parse(output.depends_on)).toContain(issue2.id);
    expect(output.status).toBe("queue");
  });

  test("prints 'blocked に変更しました' when issue was active", () => {
    const issue1 = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });
    const issue2 = createIssue(dbPath, {
      title: "B",
      type: "feat",
      acceptance: "ok",
    });
    updateIssue(dbPath, issue1.id, { status: "active" });

    const result = runCli(
      ["issue", "add-dep", String(issue1.id), String(issue2.id)],
      dbPath,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("blocked に変更しました");
    const lines = result.stdout.trim().split("\n");
    const jsonPart = lines.slice(1).join("\n");
    const output = JSON.parse(jsonPart);
    expect(output.status).toBe("blocked");
    expect(JSON.parse(output.depends_on)).toContain(issue2.id);
  });

  test("errors when issue does not exist", () => {
    const result = runCli(["issue", "add-dep", "999", "1"], dbPath);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Issue 999 not found");
  });

  test("errors when dep does not exist", () => {
    const issue1 = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });

    const result = runCli(
      ["issue", "add-dep", String(issue1.id), "999"],
      dbPath,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Issue 999 not found");
  });

  test("errors on self-dependency", () => {
    const issue1 = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });

    const result = runCli(
      ["issue", "add-dep", String(issue1.id), String(issue1.id)],
      dbPath,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Cannot add self-dependency");
  });

  test("errors on circular dependency", () => {
    const issue1 = createIssue(dbPath, {
      title: "A",
      type: "feat",
      acceptance: "ok",
    });
    const issue2 = createIssue(dbPath, {
      title: "B",
      type: "feat",
      acceptance: "ok",
    });
    runCli(["issue", "add-dep", String(issue1.id), String(issue2.id)], dbPath);

    const result = runCli(
      ["issue", "add-dep", String(issue2.id), String(issue1.id)],
      dbPath,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Circular dependency detected");
  });

  test("errors when arguments are missing", () => {
    const result = runCli(["issue", "add-dep"], dbPath);

    expect(result.exitCode).toBe(1);
  });
});
