import {
  getIssue,
  checkDeps,
  runVerifiedOrchestrator,
  type SandboxExecutor,
} from "@magi/core";
import type { Issue } from "@magi/core";

export interface ImplementDeps {
  dbPath: string;
  repoPath: string;
  baseBranch: string;
  maxRetries: number;
  executor: SandboxExecutor;
}

export interface ImplementResult {
  success: boolean;
  issue: Issue;
  branch: string;
  output: string;
}

export function validateIssue(
  dbPath: string,
  id: number,
): { ok: true; issue: Issue } | { ok: false; reason: string } {
  const issue = getIssue(dbPath, id);
  if (!issue) return { ok: false, reason: `issue #${id} not found` };

  if (issue.status !== "queue") {
    return {
      ok: false,
      reason: `issue #${id} status is "${issue.status}", expected "queue"`,
    };
  }

  const depsResult = checkDeps(dbPath, id);
  if (depsResult.blocked) {
    const deps = depsResult.unresolvedDeps
      .map((d) => `#${d.id} (${d.status})`)
      .join(", ");
    return { ok: false, reason: `issue #${id} is blocked by: ${deps}` };
  }

  return { ok: true, issue };
}

export async function runImplement(
  issue: Issue,
  deps: ImplementDeps,
): Promise<ImplementResult> {
  const result = await runVerifiedOrchestrator(issue, {
    dbPath: deps.dbPath,
    repoPath: deps.repoPath,
    baseBranch: deps.baseBranch,
    maxRetries: deps.maxRetries,
    executor: deps.executor,
  });

  return {
    success: result.success,
    issue: getIssue(deps.dbPath, issue.id)!,
    branch: result.branch,
    output: result.output,
  };
}
