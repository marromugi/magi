import {
  migrate,
  defaultDbPath,
  createIssue,
  getIssue,
  listIssues,
  updateIssue,
  listReadyIssues,
  checkInterrupt,
  createReviewSchedule,
  listReviewSchedules,
  removeReviewSchedule,
  markReviewed,
  generateWorkflow,
  closeDb,
  type IssueType,
  type IssuePriority,
  type IssueStatus,
} from "@magi/core";

// ── Helpers ──

function getProjectRoot(): string {
  return process.env.MAGI_PROJECT_ROOT ?? process.cwd();
}

function getDbPath(): string {
  return process.env.MAGI_DB_PATH ?? defaultDbPath(getProjectRoot());
}

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }
  return flags;
}

// ── Commands ──

function cmdDbInit() {
  const dbPath = getDbPath();
  migrate(dbPath);
  console.log(`issues.db initialized at ${dbPath}`);
}

function cmdIssueCreate(args: string[]) {
  const flags = parseFlags(args);
  if (!flags.title) die("--title is required");
  if (!flags.type) die("--type is required");
  if (!flags.acceptance) die("--acceptance is required");

  const dbPath = getDbPath();
  migrate(dbPath);

  const issue = createIssue(dbPath, {
    title: flags.title,
    type: flags.type as IssueType,
    priority: (flags.priority as IssuePriority) ?? "normal",
    depends_on: flags["depends-on"]
      ? JSON.parse(flags["depends-on"])
      : undefined,
    affects: flags.affects ? JSON.parse(flags.affects) : undefined,
    acceptance: flags.acceptance,
    context: flags.context,
    branch: flags.branch,
    commit_message: flags["commit-message"],
  });

  console.log(JSON.stringify(issue, null, 2));
}

function cmdIssueList(args: string[]) {
  const flags = parseFlags(args);
  const dbPath = getDbPath();

  const statusFilter = flags.status
    ? (flags.status.split(",") as IssueStatus[])
    : undefined;

  const issues = listIssues(dbPath, {
    status: statusFilter,
  });

  console.log(JSON.stringify(issues, null, 2));
}

function cmdIssueShow(args: string[]) {
  const id = Number(args[0]);
  if (isNaN(id)) die("issue ID is required");

  const issue = getIssue(getDbPath(), id);
  if (!issue) die(`issue #${id} not found`);

  console.log(JSON.stringify(issue, null, 2));
}

function cmdIssueUpdate(args: string[]) {
  const id = Number(args[0]);
  if (isNaN(id)) die("issue ID is required");

  const flags = parseFlags(args.slice(1));
  const dbPath = getDbPath();

  const issue = updateIssue(dbPath, id, {
    status: flags.status as IssueStatus | undefined,
    branch: flags.branch,
    worktree_path: flags["worktree-path"],
  });

  if (!issue) die(`issue #${id} not found`);
  console.log(JSON.stringify(issue, null, 2));
}

function cmdIssueReady() {
  const issues = listReadyIssues(getDbPath());
  console.log(JSON.stringify(issues, null, 2));
}

async function cmdCheckInterrupt(args: string[]) {
  let filePath = args[0];

  // 引数がなければ stdin から hook JSON を読んで file_path を取得
  if (!filePath) {
    try {
      const input = await Bun.stdin.text();
      const hookInput = JSON.parse(input);
      filePath = hookInput.tool_input?.file_path;
    } catch {
      // パース失敗はスキップ
    }
  }

  if (!filePath) process.exit(0);

  const projectRoot = getProjectRoot();
  const dbPath = getDbPath();

  // 絶対パスを相対パスに変換
  const relPath = filePath.startsWith(projectRoot)
    ? filePath.slice(projectRoot.length + 1)
    : filePath;

  const result = checkInterrupt(dbPath, relPath);

  if (result.blocked && result.issueId !== undefined) {
    const output = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: `INTERRUPT: Issue #${result.issueId} '${result.title}' が進行中です。${result.reason}。現在の作業を WIP コミットして中断してください。`,
      },
    };
    console.log(JSON.stringify(output));
    process.exit(2);
  }

  process.exit(0);
}

function cmdReviewAdd(args: string[]) {
  const flags = parseFlags(args);
  if (!flags.cron) die("--cron is required");

  const dbPath = getDbPath();
  migrate(dbPath);

  const schedule = createReviewSchedule(dbPath, {
    cron_expr: flags.cron,
    branch: flags.branch,
    prompt: flags.prompt,
  });

  console.log(JSON.stringify(schedule, null, 2));
}

function cmdReviewList() {
  const dbPath = getDbPath();
  const schedules = listReviewSchedules(dbPath);
  console.log(JSON.stringify(schedules, null, 2));
}

function cmdReviewRemove(args: string[]) {
  const id = Number(args[0]);
  if (isNaN(id)) die("schedule ID is required");

  const removed = removeReviewSchedule(getDbPath(), id);
  if (!removed) die(`schedule #${id} not found`);
  console.log(`schedule #${id} removed`);
}

function cmdReviewRun(args: string[]) {
  const id = args[0] ? Number(args[0]) : undefined;
  const dbPath = getDbPath();
  const schedules = listReviewSchedules(dbPath);

  const targets =
    id !== undefined
      ? schedules.filter((s) => s.id === id)
      : schedules.filter((s) => s.enabled);

  if (targets.length === 0) die("no review schedules found");

  for (const schedule of targets) {
    const since = schedule.last_reviewed_at ?? "";
    const sinceArg = since ? `--since="${since}"` : "";

    // git log の結果を JSON で出力
    const result = Bun.spawnSync(
      [
        "git",
        "log",
        ...(sinceArg ? [sinceArg] : []),
        "--pretty=format:%H\t%an\t%ai\t%s",
        schedule.branch,
      ],
      { cwd: getProjectRoot() },
    );

    const stdout = result.stdout.toString().trim();
    const commits = stdout
      ? stdout.split("\n").map((line) => {
          const [hash, author, date, subject] = line.split("\t");
          return { hash, author, date, subject };
        })
      : [];

    console.log(
      JSON.stringify(
        {
          schedule_id: schedule.id,
          branch: schedule.branch,
          prompt: schedule.prompt,
          since: since || null,
          commits,
        },
        null,
        2,
      ),
    );

    markReviewed(dbPath, schedule.id);
  }
}

async function cmdGenerateWorkflow(args: string[]) {
  const flags = parseFlags(args);
  const dbPath = getDbPath();
  migrate(dbPath);

  const schedules = listReviewSchedules(dbPath).filter((s) => s.enabled);
  const yaml = generateWorkflow(schedules);

  if (flags.output) {
    await Bun.write(flags.output, yaml);
    console.log(`workflow written to ${flags.output}`);
  } else {
    process.stdout.write(yaml);
  }
}

function printUsage() {
  console.log(`magi - autonomous coding agent orchestrator

Usage: magi <command> [options]

Commands:
  db init                    Initialize the issues database
  issue create [options]     Create a new issue
  issue list [--status s]    List issues (optionally filter by status)
  issue show <id>            Show issue details
  issue update <id> [opts]   Update an issue
  issue ready                List issues ready to implement
  review add --cron <expr> [--branch main] [--prompt "..."]  Add a review schedule
  review list                List review schedules
  review remove <id>         Remove a review schedule
  review run [<id>]          Run review (collect commits since last review)
  check-interrupt <file>     Check if file is blocked by an interrupt issue`);
}

// ── Router ──

const [command, subcommand, ...rest] = process.argv.slice(2);

async function main() {
  switch (command) {
    case "db":
      if (subcommand === "init") cmdDbInit();
      else die(`unknown db command: ${subcommand}`);
      break;
    case "issue":
      switch (subcommand) {
        case "create":
          cmdIssueCreate(rest);
          break;
        case "list":
          cmdIssueList(rest);
          break;
        case "show":
          cmdIssueShow(rest);
          break;
        case "update":
          cmdIssueUpdate(rest);
          break;
        case "ready":
          cmdIssueReady();
          break;
        default:
          die(`unknown issue command: ${subcommand}`);
      }
      break;
    case "review":
      switch (subcommand) {
        case "add":
          cmdReviewAdd(rest);
          break;
        case "list":
          cmdReviewList();
          break;
        case "remove":
          cmdReviewRemove(rest);
          break;
        case "run":
          cmdReviewRun(rest);
          break;
        case "generate-workflow":
          await cmdGenerateWorkflow(rest);
          break;
        default:
          die(`unknown review command: ${subcommand}`);
      }
      break;
    case "check-interrupt":
      await cmdCheckInterrupt([subcommand ?? "", ...rest]);
      break;
    default:
      printUsage();
  }
}

main().finally(() => closeDb());
