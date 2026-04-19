import type { Issue, UpdateIssueInput, ExecFnWithStatus } from "./issue.js";
import {
  listIssues,
  getIssue,
  updateIssue,
  rebaseIssueBranch,
} from "./issue.js";

function defaultExec(
  cmd: string,
  args: string[],
): { stdout: string; exitCode: number } {
  const proc = Bun.spawnSync([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: proc.stdout?.toString() ?? "",
    exitCode: proc.exitCode ?? 0,
  };
}

export function listPRQueue(dbPath: string): Issue[] | Error {
  const issues = listIssues(dbPath, { status: ["implemented"] });
  return topologicalSort(issues);
}

function topologicalSort(issues: Issue[]): Issue[] | Error {
  const idSet = new Set(issues.map((i) => i.id));
  const inDegree = new Map<number, number>(issues.map((i) => [i.id, 0]));
  const dependents = new Map<number, number[]>(issues.map((i) => [i.id, []]));

  for (const issue of issues) {
    const deps = JSON.parse(issue.depends_on) as number[];
    for (const depId of deps) {
      if (!idSet.has(depId)) continue;
      dependents.get(depId)!.push(issue.id);
      inDegree.set(issue.id, inDegree.get(issue.id)! + 1);
    }
  }

  const issueMap = new Map(issues.map((i) => [i.id, i]));
  const queue = issues
    .filter((i) => inDegree.get(i.id) === 0)
    .map((i) => i.id)
    .sort((a, b) => a - b);

  const result: Issue[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(issueMap.get(id)!);

    const next = dependents.get(id)!;
    for (const neighborId of next) {
      const deg = inDegree.get(neighborId)! - 1;
      inDegree.set(neighborId, deg);
      if (deg === 0) {
        const insertIdx = queue.findIndex((q) => q > neighborId);
        if (insertIdx === -1) queue.push(neighborId);
        else queue.splice(insertIdx, 0, neighborId);
      }
    }
  }

  if (result.length !== issues.length) {
    return new Error("Circular dependency detected");
  }

  return result;
}

export function createIssuePR(
  dbPath: string,
  issueId: number,
  exec: ExecFnWithStatus = defaultExec,
): Error | null {
  const issue = getIssue(dbPath, issueId);
  if (!issue?.branch) return new Error(`Issue ${issueId} has no branch`);

  const title = issue.commit_message ?? issue.title;
  const result = exec("gh", [
    "pr",
    "create",
    "--base",
    "main",
    "--head",
    issue.branch,
    "--title",
    title,
    "--body",
    issue.acceptance,
  ]);

  if (result.exitCode !== 0) {
    return new Error(`PR creation failed for ${issue.branch}`);
  }
  return null;
}

export function mergeIssuePR(
  dbPath: string,
  issueId: number,
  exec: ExecFnWithStatus = defaultExec,
): Error | null {
  const issue = getIssue(dbPath, issueId);
  if (!issue?.branch) return new Error(`Issue ${issueId} has no branch`);

  const result = exec("gh", ["pr", "merge", "--merge", issue.branch]);

  if (result.exitCode !== 0) {
    return new Error(`PR merge failed for ${issue.branch}`);
  }
  return null;
}

export function isPRMerged(
  dbPath: string,
  issueId: number,
  exec: ExecFnWithStatus = defaultExec,
): boolean {
  const issue = getIssue(dbPath, issueId);
  if (!issue?.branch) return false;

  const result = exec("gh", [
    "pr",
    "view",
    issue.branch,
    "--json",
    "state",
    "--jq",
    ".state",
  ]);

  return result.stdout.trim() === "MERGED";
}

export interface ProcessPRQueueDeps {
  rebase(dbPath: string, issueId: number): Error | null;
  createPR(dbPath: string, issueId: number): Error | null;
  mergePR(dbPath: string, issueId: number): Error | null;
  checkMerged(dbPath: string, issueId: number): boolean;
  listQueue(dbPath: string): Issue[] | Error;
  listInReview(dbPath: string): Issue[];
  update(dbPath: string, id: number, input: UpdateIssueInput): Issue | null;
}

export async function processPRQueue(
  options: { dbPath: string; autoMerge: boolean },
  deps?: Partial<ProcessPRQueueDeps>,
): Promise<void> {
  const { dbPath, autoMerge } = options;
  const rebase = deps?.rebase ?? ((d, id) => rebaseIssueBranch(d, id));
  const createPR = deps?.createPR ?? ((d, id) => createIssuePR(d, id));
  const mergePR = deps?.mergePR ?? ((d, id) => mergeIssuePR(d, id));
  const checkMerged = deps?.checkMerged ?? ((d, id) => isPRMerged(d, id));
  const listQueue = deps?.listQueue ?? listPRQueue;
  const listInReview =
    deps?.listInReview ?? ((d) => listIssues(d, { status: ["in-review"] }));
  const update = deps?.update ?? updateIssue;

  // Check in-review issues first
  const inReview = listInReview(dbPath);
  for (const issue of inReview) {
    if (checkMerged(dbPath, issue.id)) {
      update(dbPath, issue.id, { status: "done" });
      return;
    }
  }

  // If there are unmerged in-review issues, don't process new ones
  if (inReview.length > 0) return;

  const queue = listQueue(dbPath);
  if (queue instanceof Error || queue.length === 0) return;

  const issue = queue[0]!;

  const rebaseError = rebase(dbPath, issue.id);
  if (rebaseError) return;

  const prError = createPR(dbPath, issue.id);
  if (prError) {
    update(dbPath, issue.id, { status: "blocked" });
    return;
  }

  if (autoMerge) {
    const mergeError = mergePR(dbPath, issue.id);
    if (mergeError) {
      update(dbPath, issue.id, { status: "blocked" });
    } else {
      update(dbPath, issue.id, { status: "done" });
    }
  } else {
    update(dbPath, issue.id, { status: "in-review" });
  }
}
