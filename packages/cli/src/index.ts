import { resolve } from "path";
import {
  buildImage,
  imageExists,
  runSandbox,
  listSandboxes,
  startSandbox,
  execInSandbox,
  stopSandbox,
} from "@magi/sandbox";
import {
  resolveGhToken,
  resolveOauthToken,
  buildSandboxConfig,
} from "./sandbox-helpers";
import {
  migrate,
  defaultDbPath,
  createIssue,
  getIssue,
  listIssues,
  updateIssue,
  listReadyIssues,
  addDependency,
  checkInterrupt,
  checkDeps,
  createReviewSchedule,
  listReviewSchedules,
  removeReviewSchedule,
  markReviewed,
  generateWorkflow,
  listPRQueue,
  closeDb,
  processPRQueue,
  type IssueType,
  type IssuePriority,
  type IssueStatus,
  runVerifiedOrchestrator,
  type SandboxExecutor,
} from "@magi/core";
import { formatReviewAsMarkdown } from "./review-formatter";
import { validateIssue, runImplement } from "./implement.js";
import { createDaemon } from "./daemon.js";
import {
  createRichLogger,
  streamWithPrefix,
  logDaemonStart,
  logDaemonReady,
  logDaemonShutdown,
  logDaemonStopped,
} from "./logger.js";

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

function cmdIssueAddDep(args: string[]) {
  const issueId = Number(args[0]);
  const depId = Number(args[1]);
  if (isNaN(issueId) || isNaN(depId))
    die("usage: issue add-dep <issueId> <depId>");

  const dbPath = getDbPath();
  const before = getIssue(dbPath, issueId);

  let issue;
  try {
    issue = addDependency(dbPath, issueId, depId);
  } catch (e) {
    die((e as Error).message);
  }

  if (before?.status === "active" && issue.status === "blocked") {
    console.log("blocked に変更しました");
  }

  console.log(JSON.stringify(issue, null, 2));
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

async function cmdCheckDeps(args: string[]) {
  let issueId = args[0] ? Number(args[0]) : NaN;

  if (isNaN(issueId)) {
    try {
      const input = await Bun.stdin.text();
      const hookInput = JSON.parse(input);
      const fromStdin = hookInput.tool_input?.issue_id ?? hookInput.issue_id;
      if (fromStdin !== undefined) issueId = Number(fromStdin);
    } catch {
      // パース失敗はスキップ
    }
    if (isNaN(issueId) && process.env.MAGI_ISSUE_ID) {
      issueId = Number(process.env.MAGI_ISSUE_ID);
    }
  }

  if (isNaN(issueId)) process.exit(0);

  let result;
  try {
    result = checkDeps(getDbPath(), issueId);
  } catch {
    die(`issue #${issueId} not found`);
  }

  if (result.blocked) {
    const depList = result.unresolvedDeps
      .map((dep) => `  - #${dep.id} ${dep.title} (${dep.status})`)
      .join("\n");
    const output = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: `BLOCKED: Issue #${issueId} の依存が未解決です。セッションを中断し、作業内容をコミットしてください。\n\n未解決の依存:\n${depList}`,
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
  const flags = parseFlags(args);
  const outputFormat = flags["output-format"] ?? "json";
  const idArg = args.find((a) => /^\d+$/.test(a));
  const id = idArg ? Number(idArg) : undefined;

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

    const data = {
      schedule_id: schedule.id,
      cron_expr: schedule.cron_expr,
      branch: schedule.branch,
      prompt: schedule.prompt,
      since: since || null,
      commits,
    };

    if (outputFormat === "markdown") {
      console.log(formatReviewAsMarkdown(data));
    } else {
      console.log(JSON.stringify(data, null, 2));
    }

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

async function cmdDaemonStart(args: string[]) {
  const flags = parseFlags(args);
  const intervalSec = Number(flags.interval ?? "30");
  const concurrency = Number(flags.concurrency ?? "1");

  if (isNaN(intervalSec) || intervalSec <= 0)
    die("--interval must be a positive number");
  if (isNaN(concurrency) || concurrency < 1)
    die("--concurrency must be a positive integer");

  const dbPath = getDbPath();
  migrate(dbPath);

  const logger = createRichLogger();
  logDaemonStart(intervalSec, concurrency);

  const oauthToken = resolveOauthToken();
  if (!oauthToken)
    die(
      "CLAUDE_CODE_OAUTH_TOKEN is not set. Please set it to your Claude OAuth token.",
    );
  const ghToken = await resolveGhToken();
  const repoPath = getProjectRoot();

  const daemon = createDaemon({
    interval: intervalSec * 1000,
    concurrency,
    fetchReadyIssues: () => listReadyIssues(dbPath),
    runIssue: async (issue) => {
      const executor: SandboxExecutor = {
        start: (config) =>
          startSandbox({
            ...config,
            repoPath,
            commitMessage: issue.commit_message ?? undefined,
            containerName: `magi-sandbox-issue-${issue.id}`,
            enableFirewall: true,
            oauthToken,
            ghToken,
          }),
        exec: (handle, command, opts) =>
          execInSandbox(handle, command, {
            ...opts,
            onStreams: async (stdout, stderr) => ({
              stdout: await streamWithPrefix(stdout, issue.id),
              stderr: await streamWithPrefix(stderr, issue.id),
            }),
          }),
        stop: (handle) => stopSandbox(handle),
      };

      const result = await runVerifiedOrchestrator(issue, {
        dbPath,
        repoPath,
        baseBranch: "main",
        maxRetries: 5,
        executor,
      });

      if (!result.success) {
        throw new Error(`implementation failed for ${result.branch}`);
      }
    },
    logger,
  });

  daemon.start();
  logDaemonReady();

  await new Promise<void>((resolve) => {
    process.on("SIGINT", async () => {
      logDaemonShutdown();
      await daemon.stop();
      logDaemonStopped();
      resolve();
    });
  });
}

async function cmdPrStart(args: string[]) {
  const flags = parseFlags(args);
  const autoMerge = flags["auto-merge"] === "true";
  const intervalSec = Number(flags.interval ?? "30");
  const once = flags.once === "true";

  if (isNaN(intervalSec) || intervalSec <= 0)
    die("--interval must be a positive number");

  const dbPath = getDbPath();
  migrate(dbPath);

  const ts = () => new Date().toISOString();
  console.log(
    `[${ts()}] pr daemon starting (auto-merge=${autoMerge}, interval=${intervalSec}s, once=${once})`,
  );

  await processPRQueue({ dbPath, autoMerge });

  if (once) {
    console.log(`[${ts()}] done`);
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setInterval(async () => {
      await processPRQueue({ dbPath, autoMerge });
    }, intervalSec * 1000);

    process.on("SIGINT", () => {
      console.log(`\n[${ts()}] shutting down...`);
      clearInterval(timer);
      resolve();
    });
  });

  console.log(`[${ts()}] stopped`);
}

async function cmdSandboxRun(args: string[]) {
  const flags = parseFlags(args);
  if (!flags.branch) die("--branch is required");
  if (!flags.prompt) die("--prompt is required");

  const oauthToken = resolveOauthToken();
  if (!oauthToken)
    die(
      "CLAUDE_CODE_OAUTH_TOKEN is not set. Please set it to your Claude OAuth token.",
    );

  const repoPath = flags.repo ?? process.cwd();
  const ghToken = await resolveGhToken();
  const config = buildSandboxConfig(repoPath, flags, oauthToken, ghToken);

  const exists = await imageExists();
  if (!exists) {
    console.error(
      "warning: magi-sandbox image not found. Run 'magi sandbox build' first.",
    );
  }

  const result = await runSandbox({ ...config, stream: true });
  process.exit(result.exitCode);
}

async function cmdSandboxBuild(args: string[]) {
  const flags = parseFlags(args);
  const dockerfilePath =
    flags.dockerfile ?? resolve(import.meta.dir, "../../sandbox/Dockerfile");
  await buildImage(dockerfilePath);
  console.log("magi-sandbox image built successfully");
}

async function cmdSandboxList() {
  const containers = await listSandboxes();
  if (containers.length === 0) {
    console.log("no running sandbox containers");
  } else {
    for (const name of containers) {
      console.log(name);
    }
  }
}

function cmdPrList() {
  const dbPath = getDbPath();
  const result = listPRQueue(dbPath);

  if (result instanceof Error) die(result.message);

  if (result.length === 0) {
    console.log("implemented な issue がありません");
    return;
  }

  const colWidths = {
    order: 5,
    id: Math.max(4, ...result.map((i) => String(i.id).length)),
    title: Math.max(5, ...result.map((i) => i.title.length)),
    branch: Math.max(6, ...result.map((i) => (i.branch ?? "-").length)),
  };

  const row = (order: string, id: string, title: string, branch: string) =>
    `${order.padEnd(colWidths.order)}  ${id.padEnd(colWidths.id)}  ${title.padEnd(colWidths.title)}  ${branch}`;

  const sep = [
    "-".repeat(colWidths.order),
    "-".repeat(colWidths.id),
    "-".repeat(colWidths.title),
    "-".repeat(colWidths.branch),
  ].join("  ");

  console.log(row("Order", "ID", "Title", "Branch"));
  console.log(sep);
  result.forEach((issue, idx) => {
    console.log(
      row(String(idx + 1), String(issue.id), issue.title, issue.branch ?? "-"),
    );
  });
}

async function cmdImplement(args: string[]) {
  const id = Number(args[0]);
  if (!id || isNaN(id)) die("usage: magi implement <issue-id>");

  const flags = parseFlags(args.slice(1));
  const dbPath = getDbPath();
  migrate(dbPath);

  const validation = validateIssue(dbPath, id);
  if (!validation.ok) die(validation.reason);

  const issue = validation.issue;
  const oauthToken = resolveOauthToken();
  if (!oauthToken)
    die(
      "CLAUDE_CODE_OAUTH_TOKEN is not set. Please set it to your Claude OAuth token.",
    );
  const ghToken = await resolveGhToken();
  const repoPath = getProjectRoot();
  const baseBranch = flags["base-branch"] ?? "main";
  const maxRetries = Number(flags["max-retries"] ?? "2");

  const containerName = `magi-sandbox-issue-${id}`;

  const executor: SandboxExecutor = {
    start: (config) =>
      startSandbox({
        ...config,
        repoPath,
        commitMessage: issue.commit_message ?? undefined,
        containerName,
        enableFirewall: true,
        oauthToken,
        ghToken,
      }),
    exec: (handle, command, opts) =>
      execInSandbox(handle, command, {
        ...opts,
        onStreams: async (stdout, stderr) => ({
          stdout: await streamWithPrefix(stdout, id),
          stderr: await streamWithPrefix(stderr, id),
        }),
      }),
    stop: (handle) => stopSandbox(handle),
  };

  console.log(`[implement] starting issue #${id}: ${issue.title}`);

  const result = await runImplement(issue, {
    dbPath,
    repoPath,
    baseBranch,
    maxRetries,
    executor,
  });

  if (result.success) {
    console.log(
      `[implement] issue #${id} implemented on branch ${result.branch}`,
    );
  } else {
    console.error(`[implement] issue #${id} failed`);
    process.exit(1);
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
  pr start [options]         Start PR daemon (--auto-merge, --interval <s>, --once)
  daemon start [options]     Start daemon (--interval <s>, --concurrency <n>)
  implement <id> [options]   Implement an issue using verified orchestrator
  check-interrupt <file>     Check if file is blocked by an interrupt issue
  check-deps [<issueId>]    Check if issue has unresolved dependencies (PreToolUse hook)
  pr list                    List implemented issues in PR order
  sandbox run --branch <b> --prompt <p> [options]  Run a sandbox container
  sandbox build [--dockerfile <path>]              Build the magi-sandbox image
  sandbox list                                     List running sandbox containers`);
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
        case "add-dep":
          cmdIssueAddDep(rest);
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
    case "pr":
      if (subcommand === "start") await cmdPrStart(rest);
      else if (subcommand === "list") cmdPrList();
      else die(`unknown pr command: ${subcommand}`);
      break;
    case "daemon":
      if (subcommand === "start") await cmdDaemonStart(rest);
      else die(`unknown daemon command: ${subcommand}`);
      break;
    case "sandbox":
      switch (subcommand) {
        case "run":
          await cmdSandboxRun(rest);
          break;
        case "build":
          await cmdSandboxBuild(rest);
          break;
        case "list":
          await cmdSandboxList();
          break;
        default:
          die(`unknown sandbox command: ${subcommand}`);
      }
      break;
    case "implement":
      await cmdImplement([subcommand ?? "", ...rest]);
      break;
    case "check-interrupt":
      await cmdCheckInterrupt([subcommand ?? "", ...rest]);
      break;
    case "check-deps":
      await cmdCheckDeps([subcommand ?? "", ...rest]);
      break;
    default:
      printUsage();
  }
}

main().finally(() => closeDb());
