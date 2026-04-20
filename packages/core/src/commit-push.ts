import type { SandboxExecutor, SandboxHandle } from "./orchestrator.js";

export interface CommitPushConfig {
  handle: SandboxHandle;
  executor: SandboxExecutor;
  branch: string;
  commitMessage: string;
}

export interface CommitPushResult {
  success: boolean;
}

async function exec(
  executor: SandboxExecutor,
  handle: SandboxHandle,
  command: string[],
): Promise<{ exitCode: number; stdout: string }> {
  return executor.exec(handle, command);
}

export async function commitAndPush(
  config: CommitPushConfig,
): Promise<CommitPushResult> {
  const { handle, executor, branch, commitMessage } = config;

  // Check for changes
  const status = await exec(executor, handle, ["git", "status", "--porcelain"]);
  if (!status.stdout.trim()) {
    return { success: false };
  }

  // Format (best-effort)
  await exec(executor, handle, ["bun", "run", "format"]);

  // Stage & commit
  await exec(executor, handle, ["git", "add", "-A"]);
  await exec(executor, handle, ["git", "commit", "-m", commitMessage]);

  // Check remote
  const remote = await exec(executor, handle, [
    "git",
    "remote",
    "get-url",
    "origin",
  ]);
  if (remote.exitCode !== 0) {
    return { success: true };
  }

  // Push
  const push = await exec(executor, handle, ["git", "push", "origin", branch]);
  if (push.exitCode !== 0) {
    return { success: false };
  }

  return { success: true };
}
