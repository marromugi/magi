import type { Database } from "bun:sqlite";
import { getDb } from "./db.js";
import { sendWebhook } from "./webhook.js";

// ── Types ──

export type IssueType = "feat" | "fix" | "refactor" | "chore" | "test" | "docs";
export type IssuePriority = "normal" | "interrupt";
export type IssueStatus =
  | "queue"
  | "active"
  | "done"
  | "blocked"
  | "failed"
  | "implemented"
  | "in-review"
  | "skipped";

export interface Issue {
  id: number;
  title: string;
  type: IssueType;
  priority: IssuePriority;
  status: IssueStatus;
  depends_on: string; // JSON array
  affects: string; // JSON array
  acceptance: string;
  context: string | null;
  branch: string | null;
  commit_message: string | null;
  worktree_path: string | null;
  session_id: string | null;
  failed_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateIssueInput {
  title: string;
  type: IssueType;
  priority?: IssuePriority;
  depends_on?: number[];
  affects?: string[];
  acceptance: string;
  context?: string;
  branch?: string;
  commit_message?: string;
}

export interface UpdateIssueInput {
  status?: IssueStatus;
  branch?: string;
  worktree_path?: string;
  session_id?: string | null;
  failed_reason?: string | null;
}

// ── Helpers ──

function db(dbPath: string): Database {
  return getDb(dbPath);
}

export type ExecFn = (cmd: string, args: string[]) => string;

function defaultExec(cmd: string, args: string[]): string {
  const { stdout } = Bun.spawnSync([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return stdout?.toString() ?? "";
}

export type ExecResultWithStatus = { stdout: string; exitCode: number };
export type ExecFnWithStatus = (
  cmd: string,
  args: string[],
) => ExecResultWithStatus;

function defaultExecWithStatus(
  cmd: string,
  args: string[],
): ExecResultWithStatus {
  const proc = Bun.spawnSync([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: proc.stdout?.toString() ?? "",
    exitCode: proc.exitCode ?? 0,
  };
}

// ── CRUD ──

export function createIssue(dbPath: string, input: CreateIssueInput): Issue {
  const d = db(dbPath);
  const result = d.run(
    `INSERT INTO issues (title, type, priority, depends_on, affects, acceptance, context, branch, commit_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.title,
      input.type,
      input.priority ?? "normal",
      JSON.stringify(input.depends_on ?? []),
      JSON.stringify(input.affects ?? []),
      input.acceptance,
      input.context ?? null,
      input.branch ?? null,
      input.commit_message ?? null,
    ],
  );
  const issue = getIssue(dbPath, Number(result.lastInsertRowid))!;
  sendWebhook({ event: "issue.created", issue });
  return issue;
}

export function getIssue(dbPath: string, id: number): Issue | null {
  return (
    db(dbPath)
      .query<Issue, [number]>("SELECT * FROM issues WHERE id = ?")
      .get(id) ?? null
  );
}

export function listIssues(
  dbPath: string,
  filter?: { status?: IssueStatus[] },
): Issue[] {
  if (filter?.status && filter.status.length > 0) {
    const placeholders = filter.status.map(() => "?").join(", ");
    return db(dbPath)
      .query<Issue, IssueStatus[]>(
        `SELECT * FROM issues WHERE status IN (${placeholders}) ORDER BY id`,
      )
      .all(...filter.status);
  }
  return db(dbPath).query<Issue, []>("SELECT * FROM issues ORDER BY id").all();
}

export function updateIssue(
  dbPath: string,
  id: number,
  input: UpdateIssueInput,
): Issue | null {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.status !== undefined) {
    sets.push("status = ?");
    values.push(input.status);
  }
  if (input.branch !== undefined) {
    sets.push("branch = ?");
    values.push(input.branch);
  }
  if (input.worktree_path !== undefined) {
    sets.push("worktree_path = ?");
    values.push(input.worktree_path);
  }
  if (input.session_id !== undefined) {
    sets.push("session_id = ?");
    values.push(input.session_id);
  }
  if (input.failed_reason !== undefined) {
    sets.push("failed_reason = ?");
    values.push(input.failed_reason);
  }
  // Clear failed_reason when moving away from failed status
  if (
    input.status !== undefined &&
    input.status !== "failed" &&
    input.failed_reason === undefined
  ) {
    sets.push("failed_reason = ?");
    values.push(null);
  }

  if (sets.length === 0) return getIssue(dbPath, id);

  values.push(id);
  db(dbPath).run(`UPDATE issues SET ${sets.join(", ")} WHERE id = ?`, values);
  const issue = getIssue(dbPath, id);
  if (issue) sendWebhook({ event: "issue.updated", issue });
  return issue;
}

function hasCycle(dbPath: string, startId: number, targetId: number): boolean {
  const visited = new Set<number>();
  const stack = [startId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const issue = getIssue(dbPath, current);
    if (issue) {
      stack.push(...(JSON.parse(issue.depends_on) as number[]));
    }
  }
  return false;
}

export function addDependency(
  dbPath: string,
  issueId: number,
  depId: number,
): Issue {
  if (issueId === depId) throw new Error("Cannot add self-dependency");

  const issue = getIssue(dbPath, issueId);
  if (!issue) throw new Error(`Issue ${issueId} not found`);
  if (issue.status === "done")
    throw new Error("Cannot add dependency to a done issue");

  const dep = getIssue(dbPath, depId);
  if (!dep) throw new Error(`Issue ${depId} not found`);

  const currentDeps = JSON.parse(issue.depends_on) as number[];
  if (currentDeps.includes(depId))
    throw new Error(`Dependency ${depId} already exists`);

  if (hasCycle(dbPath, depId, issueId))
    throw new Error("Circular dependency detected");

  const newDeps = JSON.stringify([...currentDeps, depId]);
  const d = db(dbPath);
  d.run("UPDATE issues SET depends_on = ? WHERE id = ?", [newDeps, issueId]);
  if (issue.status === "active") {
    d.run("UPDATE issues SET status = 'blocked' WHERE id = ?", [issueId]);
  }

  return getIssue(dbPath, issueId)!;
}

// ── Dependency Check ──

export type CheckDepsResult =
  | { blocked: false }
  | {
      blocked: true;
      unresolvedDeps: Array<{
        id: number;
        title: string;
        status: IssueStatus;
      }>;
    };

export function checkDeps(dbPath: string, issueId: number): CheckDepsResult {
  const issue = getIssue(dbPath, issueId);
  if (!issue) throw new Error(`Issue ${issueId} not found`);

  const depIds = JSON.parse(issue.depends_on) as number[];
  const unresolved = depIds
    .map((id) => getIssue(dbPath, id))
    .filter(
      (dep): dep is Issue =>
        dep !== null && dep.status !== "done" && dep.status !== "skipped",
    )
    .map(({ id, title, status }) => ({ id, title, status }));

  if (unresolved.length === 0) return { blocked: false };
  return { blocked: true, unresolvedDeps: unresolved };
}

/** 依存が全て done かつリモートブランチが削除済みの queue/blocked issue を返す。
 *  blocked issue が復帰条件を満たす場合は status を queue に更新する。 */
export function listReadyIssues(
  dbPath: string,
  exec: ExecFn = defaultExec,
): Issue[] {
  const candidates = db(dbPath)
    .query<Issue, []>(
      `SELECT * FROM issues AS i WHERE i.status IN ('queue', 'blocked')
       AND NOT EXISTS (
         SELECT 1 FROM json_each(i.depends_on) AS d
         JOIN issues dep ON dep.id = CAST(d.value AS INTEGER)
         WHERE dep.status NOT IN ('done', 'implemented', 'in-review', 'skipped')
       )
       ORDER BY i.id`,
    )
    .all();

  let fetched = false;
  const ready: Issue[] = [];

  for (const issue of candidates) {
    const deps = JSON.parse(issue.depends_on) as number[];
    let excluded = false;

    for (const depId of deps) {
      const dep = getIssue(dbPath, depId);
      if (dep?.branch) {
        if (!fetched) {
          exec("git", ["fetch", "--prune", "origin"]);
          fetched = true;
        }
        const output = exec("git", [
          "ls-remote",
          "--heads",
          "origin",
          dep.branch,
        ]);
        if (output.trim() !== "") {
          excluded = true;
          break;
        }
      }
    }

    if (!excluded) {
      if (issue.status === "blocked") {
        const recovered = updateIssue(dbPath, issue.id, { status: "queue" });
        if (recovered) ready.push(recovered);
      } else {
        ready.push(issue);
      }
    }
  }

  return ready;
}

export function rebaseIssueBranch(
  dbPath: string,
  issueId: number,
  exec: ExecFnWithStatus = defaultExecWithStatus,
): Error | null {
  const issue = getIssue(dbPath, issueId);
  if (!issue?.branch) return null;

  exec("git", ["fetch", "origin"]);

  const ls = exec("git", ["ls-remote", "--heads", "origin", issue.branch]);
  if (ls.stdout.trim() === "") return null;

  const rebase = exec("git", ["rebase", "origin/main", issue.branch]);
  if (rebase.exitCode !== 0) {
    exec("git", ["rebase", "--abort"]);
    updateIssue(dbPath, issueId, { status: "blocked" });
    return new Error(`Rebase conflict on ${issue.branch}`);
  }

  exec("git", ["push", "--force-with-lease", "origin", issue.branch]);
  return null;
}
