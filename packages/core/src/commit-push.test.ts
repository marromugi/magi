import { describe, it, expect } from "bun:test";
import { commitAndPush, type CommitPushConfig } from "./commit-push.js";
import type { SandboxExecutor, SandboxHandle } from "./orchestrator.js";

interface ExecCall {
  command: string[];
}

function makeFakeHandle(): SandboxHandle {
  return {
    containerName: "test-ctr",
    branch: "feat/1-test",
    baseBranch: "main",
  };
}

function makeFakeExecutor(opts?: {
  hasChanges?: boolean;
  hasRemote?: boolean;
  formatFails?: boolean;
  pushFails?: boolean;
}): { executor: SandboxExecutor; execCalls: ExecCall[] } {
  const {
    hasChanges = true,
    hasRemote = true,
    formatFails = false,
    pushFails = false,
  } = opts ?? {};

  const execCalls: ExecCall[] = [];

  const executor: SandboxExecutor = {
    start: async () => makeFakeHandle(),
    exec: async (_handle, command) => {
      execCalls.push({ command });

      // git status --porcelain
      if (command.includes("status") && command.includes("--porcelain")) {
        return {
          exitCode: 0,
          stdout: hasChanges ? " M src/index.ts\n" : "",
          stderr: "",
        };
      }

      // bun run format (via sh -c)
      if (command.some((c) => c.includes("bun run format"))) {
        return {
          exitCode: formatFails ? 1 : 0,
          stdout: "",
          stderr: formatFails ? "format error" : "",
        };
      }

      // git add -A
      if (command.includes("add") && command.includes("-A")) {
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      // git commit
      if (command.includes("commit")) {
        return { exitCode: 0, stdout: "", stderr: "" };
      }

      // git remote get-url origin
      if (command.includes("remote") && command.includes("get-url")) {
        return {
          exitCode: hasRemote ? 0 : 1,
          stdout: hasRemote ? "https://github.com/test/repo.git" : "",
          stderr: hasRemote ? "" : "fatal: No such remote",
        };
      }

      // git push
      if (command.includes("push")) {
        return {
          exitCode: pushFails ? 1 : 0,
          stdout: "",
          stderr: pushFails ? "push failed" : "",
        };
      }

      return { exitCode: 0, stdout: "", stderr: "" };
    },
    stop: async () => {},
  };

  return { executor, execCalls };
}

function makeConfig(
  executor: SandboxExecutor,
  overrides?: Partial<CommitPushConfig>,
): CommitPushConfig {
  return {
    handle: makeFakeHandle(),
    executor,
    branch: "feat/1-test",
    commitMessage: "feat: test commit",
    ...overrides,
  };
}

describe("commitAndPush", () => {
  it("runs format, add, commit, push when changes exist", async () => {
    const { executor, execCalls } = makeFakeExecutor();
    const result = await commitAndPush(makeConfig(executor));

    expect(result.success).toBe(true);

    expect(execCalls.some((c) => c.command.includes("--porcelain"))).toBe(true);
    expect(
      execCalls.some((c) =>
        c.command.some((a) => a.includes("bun run format")),
      ),
    ).toBe(true);
    expect(execCalls.some((c) => c.command.includes("-A"))).toBe(true);
    expect(execCalls.some((c) => c.command.includes("commit"))).toBe(true);
    expect(execCalls.some((c) => c.command.includes("push"))).toBe(true);
  });

  it("uses the provided commit message", async () => {
    const { executor, execCalls } = makeFakeExecutor();
    await commitAndPush(
      makeConfig(executor, { commitMessage: "fix: something" }),
    );

    const commitCall = execCalls.find((c) => c.command.includes("commit"));
    expect(commitCall?.command).toContain("fix: something");
  });

  it("returns success=false with no changes", async () => {
    const { executor } = makeFakeExecutor({ hasChanges: false });
    const result = await commitAndPush(makeConfig(executor));

    expect(result.success).toBe(false);
  });

  it("skips push when no remote is configured", async () => {
    const { executor, execCalls } = makeFakeExecutor({ hasRemote: false });
    const result = await commitAndPush(makeConfig(executor));

    expect(result.success).toBe(true);
    expect(execCalls.some((c) => c.command.includes("push"))).toBe(false);
  });

  it("continues when format fails", async () => {
    const { executor, execCalls } = makeFakeExecutor({ formatFails: true });
    const result = await commitAndPush(makeConfig(executor));

    expect(result.success).toBe(true);
    expect(execCalls.some((c) => c.command.includes("commit"))).toBe(true);
  });

  it("returns success=false when push fails", async () => {
    const { executor } = makeFakeExecutor({ pushFails: true });
    const result = await commitAndPush(makeConfig(executor));

    expect(result.success).toBe(false);
  });
});
