import { describe, it, expect } from "bun:test";
import { createExecTool } from "./exec";
import type { Sandbox } from "@magi/sandbox";
import type { ExecResult, SandboxStatus, SnapshotInfo } from "@magi/sandbox";

function createMockSandbox(
  execFn: (cmd: string, args?: string[]) => Promise<ExecResult>,
): Sandbox {
  return {
    id: "mock",
    start: async () => {},
    stop: async () => {},
    reset: async () => {},
    status: async (): Promise<SandboxStatus> => "running",
    exec: execFn,
    snapshot: async (): Promise<SnapshotInfo> => ({
      id: "snap",
      tag: "latest",
      createdAt: "",
    }),
    restore: async () => {},
  };
}

describe("exec tool", () => {
  it("returns stdout on success", async () => {
    const sandbox = createMockSandbox(async () => ({
      exitCode: 0,
      stdout: "hello world\n",
      stderr: "",
    }));
    const tool = createExecTool(sandbox);
    const result = await tool.execute({
      command: "echo",
      args: ["hello world"],
    });

    expect(result.output).toContain("hello world");
    expect(result.output).toContain("[exit code: 0]");
    expect(result.isError).toBeFalsy();
  });

  it("returns stderr and marks error on failure", async () => {
    const sandbox = createMockSandbox(async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "not found\n",
    }));
    const tool = createExecTool(sandbox);
    const result = await tool.execute({ command: "bad-cmd" });

    expect(result.output).toContain("not found");
    expect(result.output).toContain("[exit code: 1]");
    expect(result.isError).toBe(true);
  });

  it("shows (no output) when both stdout and stderr are empty", async () => {
    const sandbox = createMockSandbox(async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
    }));
    const tool = createExecTool(sandbox);
    const result = await tool.execute({ command: "true" });

    expect(result.output).toContain("(no output)");
  });
});
