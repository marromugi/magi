import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { closeDb, migrate } from "./db.js";
import { createIssue, getIssue } from "./issue.js";
import {
  buildPrompt,
  runImplementOrchestrator,
  runVerifiedOrchestrator,
  type OrchestratorConfig,
  type SandboxRunner,
  type SandboxExecutor,
  type VerifiedOrchestratorConfig,
} from "./orchestrator.js";

const TEST_DB = ":memory:";

beforeEach(() => {
  closeDb();
  migrate(TEST_DB);
});

afterEach(() => {
  closeDb();
});

function makeRunner(
  overrides: Partial<Awaited<ReturnType<SandboxRunner>>> = {},
): SandboxRunner {
  return async (config) => ({
    success: true,
    exitCode: 0,
    output: "",
    branch: config.branch,
    ...overrides,
  });
}

describe("buildPrompt", () => {
  it("includes issue title, type, branch, commit_message", () => {
    const issue = createIssue(TEST_DB, {
      title: "Add feature X",
      type: "feat",
      acceptance: "Feature X works correctly",
      branch: "feat/1-add-feature-x",
      commit_message: "feat(core): add feature x",
    });
    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Add feature X");
    expect(prompt).toContain("feat");
    expect(prompt).toContain("feat/1-add-feature-x");
    expect(prompt).toContain("feat(core): add feature x");
  });

  it("includes acceptance criteria", () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Must pass all tests",
    });
    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Must pass all tests");
  });

  it("includes background context", () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "test",
      context: "Some background context",
    });
    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Some background context");
  });

  it("includes TDD flow steps", () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "test",
    });
    const prompt = buildPrompt(issue);
    expect(prompt).toContain("Step 1");
    expect(prompt).toContain("Step 2");
    expect(prompt).toContain("Red");
    expect(prompt).toContain("Green");
    expect(prompt).toContain("bun test");
  });
});

describe("runImplementOrchestrator", () => {
  it("sets status to done and updates branch on success", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Feature works",
      branch: "feat/1-test-issue",
    });

    const config: OrchestratorConfig = {
      dbPath: TEST_DB,
      repoPath: "/repo",
      runner: makeRunner(),
    };

    const result = await runImplementOrchestrator(issue, config);

    expect(result.success).toBe(true);
    const updated = getIssue(TEST_DB, issue.id);
    expect(updated?.status).toBe("implemented");
    expect(updated?.branch).toBe("feat/1-test-issue");
  });

  it("sets status to blocked on failure", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Feature works",
      branch: "feat/1-test-issue",
    });

    const config: OrchestratorConfig = {
      dbPath: TEST_DB,
      repoPath: "/repo",
      runner: makeRunner({ success: false, exitCode: 1 }),
    };

    const result = await runImplementOrchestrator(issue, config);

    expect(result.success).toBe(false);
    const updated = getIssue(TEST_DB, issue.id);
    expect(updated?.status).toBe("blocked");
  });

  it("returns sandbox output in result", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "test",
      branch: "feat/1-test",
    });

    const config: OrchestratorConfig = {
      dbPath: TEST_DB,
      repoPath: "/repo",
      runner: makeRunner({ output: "Detailed sandbox output" }),
    };

    const result = await runImplementOrchestrator(issue, config);
    expect(result.output).toBe("Detailed sandbox output");
  });

  it("passes prompt with issue details to sandbox runner", async () => {
    const issue = createIssue(TEST_DB, {
      title: "My feature",
      type: "feat",
      acceptance: "Must work correctly",
      context: "Important background",
      branch: "feat/1-my-feature",
    });

    let capturedPrompt = "";
    const capturingRunner: SandboxRunner = async (config) => {
      capturedPrompt = config.prompt;
      return { success: true, exitCode: 0, output: "", branch: config.branch };
    };

    await runImplementOrchestrator(issue, {
      dbPath: TEST_DB,
      repoPath: "/repo",
      runner: capturingRunner,
    });

    expect(capturedPrompt).toContain("My feature");
    expect(capturedPrompt).toContain("Must work correctly");
    expect(capturedPrompt).toContain("Important background");
  });

  it("passes baseBranch and repoPath to sandbox runner", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "test",
      branch: "feat/1-test",
    });

    let capturedConfig: Parameters<SandboxRunner>[0] | null = null;
    const capturingRunner: SandboxRunner = async (config) => {
      capturedConfig = config;
      return { success: true, exitCode: 0, output: "", branch: config.branch };
    };

    await runImplementOrchestrator(issue, {
      dbPath: TEST_DB,
      repoPath: "/my/repo",
      baseBranch: "develop",
      runner: capturingRunner,
    });

    expect(capturedConfig?.repoPath).toBe("/my/repo");
    expect(capturedConfig?.baseBranch).toBe("develop");
  });
});

// ── runVerifiedOrchestrator ──

function makeMockExecutor(
  verifyStdout: string,
  opts?: { implExitCode?: number },
): SandboxExecutor {
  return {
    start: async (config) => ({
      containerName: "test-container",
      branch: config.branch,
      baseBranch: config.baseBranch,
    }),
    exec: async (_handle, command) => {
      const cmd = command.join(" ");
      // Implementation call
      if (cmd.includes("--dangerously-skip-permissions")) {
        return {
          exitCode: opts?.implExitCode ?? 0,
          stdout: "impl output",
          stderr: "",
        };
      }
      // Verification call
      if (cmd.includes("--output-format")) {
        return { exitCode: 0, stdout: verifyStdout, stderr: "" };
      }
      // commit-push
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    stop: async () => {},
  };
}

describe("runVerifiedOrchestrator", () => {
  it("extracts structured_output from Claude CLI envelope", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Works",
      branch: "feat/1-test",
    });

    const envelope = JSON.stringify({
      type: "result",
      subtype: "success",
      structured_output: { pass: true, summary: "All good", failures: [] },
    });

    const config: VerifiedOrchestratorConfig = {
      dbPath: TEST_DB,
      repoPath: "/repo",
      maxRetries: 0,
      executor: makeMockExecutor(envelope),
    };

    const result = await runVerifiedOrchestrator(issue, config);
    expect(result.success).toBe(true);

    const updated = getIssue(TEST_DB, issue.id);
    expect(updated?.status).toBe("implemented");
  });

  it("handles plain VerifyJudgment JSON (no envelope)", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Works",
      branch: "feat/2-test",
    });

    const plain = JSON.stringify({
      pass: true,
      summary: "All good",
      failures: [],
    });

    const config: VerifiedOrchestratorConfig = {
      dbPath: TEST_DB,
      repoPath: "/repo",
      maxRetries: 0,
      executor: makeMockExecutor(plain),
    };

    const result = await runVerifiedOrchestrator(issue, config);
    expect(result.success).toBe(true);
  });

  it("fails gracefully when verification fails with envelope", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Works",
      branch: "feat/3-test",
    });

    const envelope = JSON.stringify({
      type: "result",
      structured_output: {
        pass: false,
        summary: "Tests fail",
        failures: ["test_a failed"],
      },
    });

    const config: VerifiedOrchestratorConfig = {
      dbPath: TEST_DB,
      repoPath: "/repo",
      maxRetries: 0,
      executor: makeMockExecutor(envelope),
    };

    const result = await runVerifiedOrchestrator(issue, config);
    expect(result.success).toBe(false);

    const updated = getIssue(TEST_DB, issue.id);
    expect(updated?.status).toBe("failed");
  });
});
