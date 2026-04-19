import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { closeDb, migrate } from "./db.js";
import { createIssue, getIssue } from "./issue.js";
import {
  runVerifiedOrchestrator,
  type VerifiedOrchestratorConfig,
  type SandboxExecutor,
} from "./orchestrator.js";
import type { VerifyJudgment } from "./verification.js";

const TEST_DB = ":memory:";

beforeEach(() => {
  closeDb();
  migrate(TEST_DB);
});

afterEach(() => {
  closeDb();
});

interface ExecCall {
  command: string[];
  env?: Record<string, string>;
}

function makeExecutor(opts: {
  implExitCode?: number;
  verifyResults?: VerifyJudgment[];
  commitExitCode?: number;
}): { executor: SandboxExecutor; execCalls: ExecCall[]; stopped: boolean } {
  const {
    implExitCode = 0,
    verifyResults = [{ pass: true, summary: "OK", failures: [] }],
    commitExitCode = 0,
  } = opts;

  const execCalls: ExecCall[] = [];
  let verifyIndex = 0;
  const state = { stopped: false };

  const executor: SandboxExecutor = {
    start: async () => ({
      containerName: "test-ctr",
      branch: "feat/1-test",
      baseBranch: "main",
    }),
    exec: async (_handle, command, execOpts) => {
      execCalls.push({ command, env: execOpts?.env });

      // Detect which type of exec call this is
      if (command.includes("/magi/scripts/commit-push.sh")) {
        return { exitCode: commitExitCode, stdout: "", stderr: "" };
      }

      if (command.includes("--json-schema")) {
        // Verification call
        const result =
          verifyResults[verifyIndex] ?? verifyResults[verifyResults.length - 1];
        verifyIndex++;
        return {
          exitCode: 0,
          stdout: JSON.stringify(result),
          stderr: "",
        };
      }

      // Implementation call
      return { exitCode: implExitCode, stdout: "impl output", stderr: "" };
    },
    stop: async () => {
      state.stopped = true;
    },
  };

  return {
    executor,
    execCalls,
    state,
  };
}

function makeConfig(
  executor: SandboxExecutor,
  overrides?: Partial<VerifiedOrchestratorConfig>,
): VerifiedOrchestratorConfig {
  return {
    dbPath: TEST_DB,
    repoPath: "/repo",
    executor,
    ...overrides,
  };
}

describe("runVerifiedOrchestrator", () => {
  it("passes on first verification -> success, issue status done", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Feature works",
      branch: "feat/1-test",
    });

    const { executor } = makeExecutor({
      verifyResults: [{ pass: true, summary: "All good", failures: [] }],
    });

    const result = await runVerifiedOrchestrator(issue, makeConfig(executor));

    expect(result.success).toBe(true);
    const updated = getIssue(TEST_DB, issue.id);
    expect(updated?.status).toBe("done");
  });

  it("fails first verification, passes on retry -> success after 2 implementations", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Feature works",
      branch: "feat/1-test",
    });

    const { executor, execCalls } = makeExecutor({
      verifyResults: [
        { pass: false, summary: "Test failed", failures: ["error A"] },
        { pass: true, summary: "All good", failures: [] },
      ],
    });

    const result = await runVerifiedOrchestrator(issue, makeConfig(executor));

    expect(result.success).toBe(true);
    // Should have 2 implementation calls and 2 verification calls
    const implCalls = execCalls.filter(
      (c) =>
        c.command.includes("claude") &&
        c.command.includes("--dangerously-skip-permissions"),
    );
    const verifyCalls = execCalls.filter((c) =>
      c.command.includes("--json-schema"),
    );
    expect(implCalls.length).toBe(2);
    expect(verifyCalls.length).toBe(2);
  });

  it("all retries exhausted -> issue status blocked", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Feature works",
      branch: "feat/1-test",
    });

    const { executor } = makeExecutor({
      verifyResults: [
        { pass: false, summary: "Fail 1", failures: ["err1"] },
        { pass: false, summary: "Fail 2", failures: ["err2"] },
        { pass: false, summary: "Fail 3", failures: ["err3"] },
      ],
    });

    const result = await runVerifiedOrchestrator(
      issue,
      makeConfig(executor, { maxRetries: 2 }),
    );

    expect(result.success).toBe(false);
    const updated = getIssue(TEST_DB, issue.id);
    expect(updated?.status).toBe("blocked");
  });

  it("implementation itself fails (non-zero exit) -> blocked immediately", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Feature works",
      branch: "feat/1-test",
    });

    const { executor, execCalls } = makeExecutor({ implExitCode: 1 });

    const result = await runVerifiedOrchestrator(issue, makeConfig(executor));

    expect(result.success).toBe(false);
    const updated = getIssue(TEST_DB, issue.id);
    expect(updated?.status).toBe("blocked");
    // Should not have any verification calls
    const verifyCalls = execCalls.filter((c) =>
      c.command.includes("--json-schema"),
    );
    expect(verifyCalls.length).toBe(0);
  });

  it("stopSandbox is always called even on failure — cleanup guarantee", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Feature works",
      branch: "feat/1-test",
    });

    const { executor, state } = makeExecutor({ implExitCode: 1 });

    await runVerifiedOrchestrator(issue, makeConfig(executor));
    expect(state.stopped).toBe(true);
  });

  it("stopSandbox is called on success too", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Feature works",
      branch: "feat/1-test",
    });

    const { executor, state } = makeExecutor({
      verifyResults: [{ pass: true, summary: "OK", failures: [] }],
    });

    await runVerifiedOrchestrator(issue, makeConfig(executor));
    expect(state.stopped).toBe(true);
  });

  it("uses maxRetries default of 2 (3 total attempts)", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Feature works",
      branch: "feat/1-test",
    });

    const { executor, execCalls } = makeExecutor({
      verifyResults: [
        { pass: false, summary: "F1", failures: ["e1"] },
        { pass: false, summary: "F2", failures: ["e2"] },
        { pass: false, summary: "F3", failures: ["e3"] },
      ],
    });

    await runVerifiedOrchestrator(issue, makeConfig(executor));

    const implCalls = execCalls.filter(
      (c) =>
        c.command.includes("claude") &&
        c.command.includes("--dangerously-skip-permissions"),
    );
    expect(implCalls.length).toBe(3); // 1 initial + 2 retries
  });

  it("calls commit-push script on success", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Feature works",
      branch: "feat/1-test",
    });

    const { executor, execCalls } = makeExecutor({
      verifyResults: [{ pass: true, summary: "OK", failures: [] }],
    });

    await runVerifiedOrchestrator(issue, makeConfig(executor));

    const commitCalls = execCalls.filter((c) =>
      c.command.includes("/magi/scripts/commit-push.sh"),
    );
    expect(commitCalls.length).toBe(1);
  });

  it("does not call commit-push script on failure", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Feature works",
      branch: "feat/1-test",
    });

    const { executor, execCalls } = makeExecutor({
      implExitCode: 1,
    });

    await runVerifiedOrchestrator(issue, makeConfig(executor));

    const commitCalls = execCalls.filter((c) =>
      c.command.includes("/magi/scripts/commit-push.sh"),
    );
    expect(commitCalls.length).toBe(0);
  });

  it("passes --model flag when model is specified", async () => {
    const issue = createIssue(TEST_DB, {
      title: "Test issue",
      type: "feat",
      acceptance: "Feature works",
      branch: "feat/1-test",
    });

    const { executor, execCalls } = makeExecutor({
      verifyResults: [{ pass: true, summary: "OK", failures: [] }],
    });

    await runVerifiedOrchestrator(
      issue,
      makeConfig(executor, { model: "claude-sonnet-4-20250514" }),
    );

    const implCall = execCalls.find(
      (c) =>
        c.command.includes("claude") &&
        c.command.includes("--dangerously-skip-permissions"),
    );
    expect(implCall?.command).toContain("--model");
    expect(implCall?.command).toContain("claude-sonnet-4-20250514");
  });
});
