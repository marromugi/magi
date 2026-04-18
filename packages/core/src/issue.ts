import type { Database } from "bun:sqlite";
import { getDb } from "./db.js";
import { sendWebhook } from "./webhook.js";

// ── Types ──

export type IssueType = "feat" | "fix" | "refactor" | "chore" | "test" | "docs";
export type IssuePriority = "normal" | "interrupt";
export type IssueStatus = "queue" | "active" | "done" | "blocked";

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
  const values: (string | number)[] = [];

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

  if (sets.length === 0) return getIssue(dbPath, id);

  values.push(id);
  db(dbPath).run(`UPDATE issues SET ${sets.join(", ")} WHERE id = ?`, values);
  const issue = getIssue(dbPath, id);
  if (issue) sendWebhook({ event: "issue.updated", issue });
  return issue;
}

/** 依存が全て done かつリモートブランチが削除済みの queue issue を返す */
export function listReadyIssues(
  dbPath: string,
  exec: ExecFn = defaultExec,
): Issue[] {
  const candidates = db(dbPath)
    .query<Issue, []>(
      `SELECT * FROM issues AS i WHERE i.status = 'queue'
       AND NOT EXISTS (
         SELECT 1 FROM json_each(i.depends_on) AS d
         JOIN issues dep ON dep.id = CAST(d.value AS INTEGER)
         WHERE dep.status != 'done'
       )
       ORDER BY i.id`,
    )
    .all();

  let fetched = false;
  return candidates.filter((issue) => {
    const deps = JSON.parse(issue.depends_on) as number[];
    for (const depId of deps) {
      const dep = getIssue(dbPath, depId);
      if (dep?.branch) {
        if (!fetched) {
          exec("git", ["fetch", "--prune", "origin"]);
          fetched = true;
        }
        const output = exec("git", ["ls-remote", "--heads", "origin", dep.branch]);
        if (output.trim() !== "") return false;
      }
    }
    return true;
  });
}
