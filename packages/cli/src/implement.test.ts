import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { validateIssue, runImplement } from "./implement.js";
import {
  migrate,
  createIssue,
  getIssue,
  updateIssue,
  closeDb,
} from "@magi/core";
import type { SandboxExecutor } from "@magi/core";

const TEST_DB = ":memory:";

function createTestIssue(
  overrides: Partial<Parameters<typeof createIssue>[1]> = {},
) {
  return createIssue(TEST_DB, {
    title: "test issue",
    type: "feat",
    priority: "normal",
    depends_on: [],
    affects: ["src/foo.ts"],
    acceptance: "it works",
    context: "test context",
    commit_message: "feat: test",
    ...overrides,
  });
}

function makeFakeExecutor(opts: {
  implExitCode?: number;
  implStdout?: string;
}): SandboxExecutor {
  const { implExitCode = 0, implStdout = "done" } = opts;
  return {
    start: async () => ({
      containerName: "test-container",
      branch: "feat/test",
      baseBranch: "main",
    }),
    exec: async (_handle, command) => {
      const cmd = command.join(" ");
      if (cmd.includes("--output-format json")) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ pass: true, summary: "ok", failures: [] }),
          stderr: "",
        };
      }
      if (
        cmd.includes("git add") ||
        cmd.includes("git commit") ||
        cmd.includes("git push") ||
        cmd.includes("git diff")
      ) {
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return { exitCode: implExitCode, stdout: implStdout, stderr: "" };
    },
    stop: async () => {},
  };
}

describe("validateIssue", () => {
  beforeEach(() => {
    closeDb();
    migrate(TEST_DB);
  });
  afterEach(() => {
    closeDb();
  });

  it("returns error if issue does not exist", () => {
    const result = validateIssue(TEST_DB, 999);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("not found");
    }
  });

  it("returns error if issue status is not queue", () => {
    const issue = createTestIssue();
    updateIssue(TEST_DB, issue.id, { status: "active" });
    const result = validateIssue(TEST_DB, issue.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("active");
    }
  });

  it("returns error if dependencies are not done", () => {
    const dep = createTestIssue({ title: "dep" });
    const issue = createTestIssue({
      title: "child",
      depends_on: [dep.id],
    });
    const result = validateIssue(TEST_DB, issue.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("blocked");
    }
  });

  it("returns ok when issue is queue and deps are done", () => {
    const dep = createTestIssue({ title: "dep" });
    updateIssue(TEST_DB, dep.id, { status: "done" });
    const issue = createTestIssue({
      title: "child",
      depends_on: [dep.id],
    });
    const result = validateIssue(TEST_DB, issue.id);
    expect(result.ok).toBe(true);
  });

  it("returns ok when issue has no dependencies", () => {
    const issue = createTestIssue();
    const result = validateIssue(TEST_DB, issue.id);
    expect(result.ok).toBe(true);
  });
});

describe("runImplement", () => {
  beforeEach(() => {
    closeDb();
    migrate(TEST_DB);
  });
  afterEach(() => {
    closeDb();
  });

  it("returns success when orchestrator succeeds", async () => {
    const issue = createTestIssue();
    const executor = makeFakeExecutor({});

    const result = await runImplement(issue, {
      dbPath: TEST_DB,
      repoPath: "/tmp/fake-repo",
      baseBranch: "main",
      maxRetries: 0,
      executor,
    });

    expect(result.success).toBe(true);
    expect(result.issue.status).toBe("implemented");
  });

  it("returns failure when implementation exits non-zero", async () => {
    const issue = createTestIssue();
    const executor = makeFakeExecutor({ implExitCode: 1 });

    const result = await runImplement(issue, {
      dbPath: TEST_DB,
      repoPath: "/tmp/fake-repo",
      baseBranch: "main",
      maxRetries: 0,
      executor,
    });

    expect(result.success).toBe(false);
    expect(result.issue.status).toBe("failed");
  });

  it("sets issue status to active during execution", async () => {
    const issue = createTestIssue();
    let statusDuringExec: string | null = null;

    const executor: SandboxExecutor = {
      start: async () => ({
        containerName: "test",
        branch: "feat/test",
        baseBranch: "main",
      }),
      exec: async (_handle, command) => {
        const cmd = command.join(" ");
        if (cmd.includes("--output-format json")) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ pass: true, summary: "ok", failures: [] }),
            stderr: "",
          };
        }
        if (cmd.includes("git")) {
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        statusDuringExec = getIssue(TEST_DB, issue.id)!.status;
        return { exitCode: 0, stdout: "ok", stderr: "" };
      },
      stop: async () => {},
    };

    await runImplement(issue, {
      dbPath: TEST_DB,
      repoPath: "/tmp/fake-repo",
      baseBranch: "main",
      maxRetries: 0,
      executor,
    });

    expect(statusDuringExec).toBe("active");
  });
});
