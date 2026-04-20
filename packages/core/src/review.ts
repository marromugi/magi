import type { Database } from "bun:sqlite";
import { getDb } from "./db.js";

// ── Types ──

export interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  subject: string;
}

export interface ReviewRunConfig {
  dbPath: string;
  repoPath: string;
  schedule: ReviewSchedule;
}

export interface ReviewRunResult {
  scheduleId: number;
  skipped: boolean;
  comment: string | null;
}

export type ClaudeReviewer = (
  commits: CommitInfo[],
  diff: string,
  prompt: string,
) => Promise<string>;

interface ReviewRunDeps {
  gitLog: (
    repoPath: string,
    branch: string,
    since: string | null,
  ) => CommitInfo[];
  gitDiff: (repoPath: string, branch: string, since: string | null) => string;
  claude: ClaudeReviewer;
}

export interface ReviewSchedule {
  id: number;
  cron_expr: string;
  branch: string;
  prompt: string;
  last_reviewed_at: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface CreateReviewScheduleInput {
  cron_expr: string;
  branch?: string;
  prompt?: string;
}

export interface UpdateReviewScheduleInput {
  cron_expr?: string;
  branch?: string;
  prompt?: string;
  last_reviewed_at?: string;
  enabled?: boolean;
}

// ── Helpers ──

function db(dbPath: string): Database {
  return getDb(dbPath);
}

// ── CRUD ──

export function createReviewSchedule(
  dbPath: string,
  input: CreateReviewScheduleInput,
): ReviewSchedule {
  const d = db(dbPath);
  const result = d.run(
    `INSERT INTO review_schedules (cron_expr, branch, prompt) VALUES (?, ?, ?)`,
    [input.cron_expr, input.branch ?? "main", input.prompt ?? ""],
  );
  return getReviewSchedule(dbPath, Number(result.lastInsertRowid))!;
}

export function getReviewSchedule(
  dbPath: string,
  id: number,
): ReviewSchedule | null {
  return (
    db(dbPath)
      .query<
        ReviewSchedule,
        [number]
      >("SELECT * FROM review_schedules WHERE id = ?")
      .get(id) ?? null
  );
}

export function listReviewSchedules(dbPath: string): ReviewSchedule[] {
  return db(dbPath)
    .query<ReviewSchedule, []>("SELECT * FROM review_schedules ORDER BY id")
    .all();
}

export function updateReviewSchedule(
  dbPath: string,
  id: number,
  input: UpdateReviewScheduleInput,
): ReviewSchedule | null {
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (input.cron_expr !== undefined) {
    sets.push("cron_expr = ?");
    values.push(input.cron_expr);
  }
  if (input.branch !== undefined) {
    sets.push("branch = ?");
    values.push(input.branch);
  }
  if (input.prompt !== undefined) {
    sets.push("prompt = ?");
    values.push(input.prompt);
  }
  if (input.last_reviewed_at !== undefined) {
    sets.push("last_reviewed_at = ?");
    values.push(input.last_reviewed_at);
  }
  if (input.enabled !== undefined) {
    sets.push("enabled = ?");
    values.push(input.enabled ? 1 : 0);
  }

  if (sets.length === 0) return getReviewSchedule(dbPath, id);

  values.push(id);
  db(dbPath).run(
    `UPDATE review_schedules SET ${sets.join(", ")} WHERE id = ?`,
    values,
  );
  return getReviewSchedule(dbPath, id);
}

export function removeReviewSchedule(dbPath: string, id: number): boolean {
  const result = db(dbPath).run("DELETE FROM review_schedules WHERE id = ?", [
    id,
  ]);
  return result.changes > 0;
}

export function generateWorkflow(schedules: ReviewSchedule[]): string {
  const scheduleTrigger =
    schedules.length > 0
      ? `  schedule:\n${schedules.map((s) => `    - cron: '${s.cron_expr}'`).join("\n")}\n`
      : "";

  const reviewSteps = schedules
    .map((s) => {
      const since = s.last_reviewed_at ?? "";
      return `      - run: magi review run --branch ${s.branch} --since "${since}"`;
    })
    .join("\n");

  return `name: MAGI Review
on:
${scheduleTrigger}  workflow_dispatch: {}
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run build
${reviewSteps}
`;
}

/** last_reviewed_at を現在時刻に更新する */
export function markReviewed(
  dbPath: string,
  id: number,
): ReviewSchedule | null {
  db(dbPath).run(
    "UPDATE review_schedules SET last_reviewed_at = datetime('now', 'localtime') WHERE id = ?",
    [id],
  );
  return getReviewSchedule(dbPath, id);
}

// ── Review Execution ──

function defaultGitLog(
  repoPath: string,
  branch: string,
  since: string | null,
): CommitInfo[] {
  const args = ["git", "log"];
  if (since) args.push(`--since=${since}`);
  args.push("--pretty=format:%H\t%an\t%ai\t%s", branch);

  const result = Bun.spawnSync(args, { cwd: repoPath });
  const stdout = result.stdout.toString().trim();
  if (!stdout) return [];

  return stdout.split("\n").map((line) => {
    const [hash, author, date, subject] = line.split("\t");
    return { hash, author, date, subject };
  });
}

function defaultGitDiff(
  repoPath: string,
  branch: string,
  since: string | null,
): string {
  const args = ["git", "log", "-p"];
  if (since) args.push(`--since=${since}`);
  args.push(branch);

  const result = Bun.spawnSync(args, { cwd: repoPath });
  return result.stdout.toString().trim();
}

async function defaultClaudeReviewer(
  commits: CommitInfo[],
  diff: string,
  prompt: string,
): Promise<string> {
  const commitList = commits
    .map((c) => `- ${c.hash.slice(0, 7)} ${c.subject} (${c.author}, ${c.date})`)
    .join("\n");

  const fullPrompt = [
    "You are a code reviewer. Review the following commits and provide constructive feedback.",
    "",
    ...(prompt ? [`## Review Focus\n${prompt}`, ""] : []),
    "## Commits",
    commitList,
    "",
    "## Changes",
    "```",
    diff,
    "```",
  ].join("\n");

  const result = Bun.spawnSync(["claude", "--print", fullPrompt], {
    env: process.env as Record<string, string>,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `claude exited with code ${result.exitCode}: ${result.stderr.toString()}`,
    );
  }

  return result.stdout.toString().trim();
}

export async function runReview(
  config: ReviewRunConfig,
  deps?: Partial<ReviewRunDeps>,
): Promise<ReviewRunResult> {
  const { dbPath, repoPath, schedule } = config;
  const gitLogFn = deps?.gitLog ?? defaultGitLog;
  const gitDiffFn = deps?.gitDiff ?? defaultGitDiff;
  const claudeFn = deps?.claude ?? defaultClaudeReviewer;

  const since = schedule.last_reviewed_at ?? null;

  const commits = gitLogFn(repoPath, schedule.branch, since);

  if (commits.length === 0) {
    return { scheduleId: schedule.id, skipped: true, comment: null };
  }

  const diff = gitDiffFn(repoPath, schedule.branch, since);
  const comment = await claudeFn(commits, diff, schedule.prompt);

  markReviewed(dbPath, schedule.id);

  return { scheduleId: schedule.id, skipped: false, comment };
}
