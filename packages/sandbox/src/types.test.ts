import { describe, it, expect } from "bun:test";
import type { SandboxHandle, ExecResult, VerifyJudgment } from "./types.js";

describe("SandboxHandle type", () => {
  it("can be constructed with required fields", () => {
    const handle: SandboxHandle = {
      containerName: "magi-sandbox-abc123",
      branch: "feat/1-test",
      baseBranch: "main",
    };
    expect(handle.containerName).toBe("magi-sandbox-abc123");
    expect(handle.branch).toBe("feat/1-test");
    expect(handle.baseBranch).toBe("main");
  });
});

describe("ExecResult type", () => {
  it("can be constructed with required fields", () => {
    const result: ExecResult = {
      exitCode: 0,
      stdout: "output",
      stderr: "",
    };
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("output");
    expect(result.stderr).toBe("");
  });
});

describe("VerifyJudgment type", () => {
  it("can be constructed with required fields", () => {
    const judgment: VerifyJudgment = {
      pass: true,
      summary: "All tests pass",
      failures: [],
    };
    expect(judgment.pass).toBe(true);
    expect(judgment.summary).toBe("All tests pass");
    expect(judgment.failures).toEqual([]);
  });

  it("can hold failure details", () => {
    const judgment: VerifyJudgment = {
      pass: false,
      summary: "Tests failed",
      failures: ["Test A failed", "Test B failed"],
    };
    expect(judgment.pass).toBe(false);
    expect(judgment.failures).toHaveLength(2);
  });
});
