import { updateIssue } from "./issue.js";
import type { Issue } from "./issue.js";
import {
  VERIFY_JSON_SCHEMA,
  buildVerifyPrompt,
  buildReimplementPrompt,
} from "./verification.js";
import type { VerifyJudgment } from "./verification.js";

export interface SandboxRunConfig {
  repoPath: string;
  branch: string;
  baseBranch: string;
  prompt: string;
  commitMessage?: string;
}

export interface SandboxRunResult {
  success: boolean;
  exitCode: number;
  output: string;
  branch: string;
}

export type SandboxRunner = (
  config: SandboxRunConfig,
) => Promise<SandboxRunResult>;

export interface OrchestratorConfig {
  dbPath: string;
  repoPath: string;
  baseBranch?: string;
  runner: SandboxRunner;
}

export interface OrchestratorResult {
  success: boolean;
  output: string;
  branch: string;
}

const TDD_FLOW = `## 実装フロー

必ず以下の TDD フローに従うこと:

### Step 1: テストを書く (Red)
- CLAUDE.md とプロジェクトの既存テストコードを必ず確認し、規約に従う
- 受け入れ条件をテストケースに落とす
- テストを実行して Red (失敗) になることを確認する

### Step 2: 実装 (Green)
- テストが通る最小限の実装を行う
- CLAUDE.md の規約に従う
- 実装後にテストを実行して Green (成功) になることを確認する

### Step 3: リファクタ (任意)
- 明らかな改善点があればリファクタする
- テストが Green のまま維持されることを確認する

### 重要な規約
- パッケージマネージャは bun を使うこと (npm/yarn/pnpm 禁止)
- テスト実行: bun test`;

export function buildPrompt(issue: Issue): string {
  const affects = JSON.parse(issue.affects) as string[];

  return `## Issue
- Title: ${issue.title}
- Type: ${issue.type}
- Branch: ${issue.branch ?? ""}
- Commit Message: ${issue.commit_message ?? ""}

## 受け入れ条件
${issue.acceptance}

## 背景
${issue.context ?? ""}

## 変更対象 (推定)
${affects.join("\n")}

${TDD_FLOW}`;
}

export async function runImplementOrchestrator(
  issue: Issue,
  config: OrchestratorConfig,
): Promise<OrchestratorResult> {
  const branch = issue.branch ?? `feat/${issue.id}`;

  updateIssue(config.dbPath, issue.id, { status: "active" });

  const result = await config.runner({
    repoPath: config.repoPath,
    branch,
    baseBranch: config.baseBranch ?? "main",
    prompt: buildPrompt(issue),
    commitMessage: issue.commit_message ?? undefined,
  });

  if (result.success) {
    updateIssue(config.dbPath, issue.id, {
      status: "implemented",
      branch: result.branch,
    });
  } else {
    updateIssue(config.dbPath, issue.id, { status: "blocked" });
  }

  return {
    success: result.success,
    output: result.output,
    branch: result.branch,
  };
}

// ── Verified Orchestrator ──

/** Handle to a running long-lived sandbox container */
interface SandboxHandle {
  containerName: string;
  branch: string;
  baseBranch: string;
}

/** Result from docker exec */
interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type SandboxExecutor = {
  start: (config: SandboxRunConfig) => Promise<SandboxHandle>;
  exec: (
    handle: SandboxHandle,
    command: string[],
    opts?: {
      timeout?: number;
      env?: Record<string, string>;
      onStreams?: (
        stdout: ReadableStream<Uint8Array>,
        stderr: ReadableStream<Uint8Array>,
      ) => Promise<{ stdout: string; stderr: string }>;
    },
  ) => Promise<ExecResult>;
  stop: (handle: SandboxHandle) => Promise<void>;
};

export interface OrchestratorLogger {
  onAttemptStart?: (attempt: number, maxAttempts: number) => void;
  onImplComplete?: (
    attempt: number,
    maxAttempts: number,
    exitCode: number,
  ) => void;
  onVerifyJudgment?: (
    attempt: number,
    maxAttempts: number,
    judgment: VerifyJudgment,
  ) => void;
  onRetry?: (
    attempt: number,
    maxAttempts: number,
    judgment: VerifyJudgment,
  ) => void;
}

export interface VerifiedOrchestratorConfig {
  dbPath: string;
  repoPath: string;
  baseBranch?: string;
  maxRetries?: number; // default: 2
  model?: string;
  executor: SandboxExecutor;
  logger?: OrchestratorLogger;
  /** Called for each exec to enable real-time streaming */
  onStreams?: (
    stdout: ReadableStream<Uint8Array>,
    stderr: ReadableStream<Uint8Array>,
  ) => Promise<{ stdout: string; stderr: string }>;
}

export async function runVerifiedOrchestrator(
  issue: Issue,
  config: VerifiedOrchestratorConfig,
): Promise<OrchestratorResult> {
  const branch = issue.branch ?? `feat/${issue.id}`;
  const baseBranch = config.baseBranch ?? "main";
  const maxRetries = config.maxRetries ?? 2;
  const maxAttempts = maxRetries + 1;

  updateIssue(config.dbPath, issue.id, { status: "active" });

  const handle = await config.executor.start({
    repoPath: config.repoPath,
    branch,
    baseBranch,
    prompt: "", // prompt is not used by startSandbox
  });

  const { logger } = config;
  let success = false;
  let output = "";
  let failedReason = "";

  const execOpts = config.onStreams
    ? { onStreams: config.onStreams }
    : undefined;

  try {
    let currentPrompt = buildPrompt(issue);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      logger?.onAttemptStart?.(attempt, maxAttempts);

      // Run implementation
      const implCmd = [
        "claude",
        "--dangerously-skip-permissions",
        "--print",
        ...(config.model ? ["--model", config.model] : []),
        currentPrompt,
      ];

      const implResult = await config.executor.exec(handle, implCmd, execOpts);
      output += implResult.stdout + implResult.stderr;

      logger?.onImplComplete?.(attempt, maxAttempts, implResult.exitCode);

      if (implResult.exitCode !== 0) {
        failedReason = `implementation failed with exit code ${implResult.exitCode}`;
        break;
      }

      // Run verification
      const verifyPrompt = buildVerifyPrompt(currentPrompt, attempt);
      const verifyCmd = [
        "claude",
        "-p",
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(VERIFY_JSON_SCHEMA),
        ...(config.model ? ["--model", config.model] : []),
        verifyPrompt,
      ];

      const verifyResult = await config.executor.exec(
        handle,
        verifyCmd,
        execOpts,
      );
      output += verifyResult.stdout + verifyResult.stderr;

      let judgment: VerifyJudgment;
      try {
        judgment = JSON.parse(verifyResult.stdout) as VerifyJudgment;
      } catch {
        judgment = {
          pass: false,
          summary: "Failed to parse verification result",
          failures: [verifyResult.stdout],
        };
      }

      logger?.onVerifyJudgment?.(attempt, maxAttempts, judgment);

      if (judgment.pass) {
        success = true;
        break;
      }

      if (attempt < maxAttempts) {
        logger?.onRetry?.(attempt, maxAttempts, judgment);
        currentPrompt = buildReimplementPrompt(buildPrompt(issue), judgment);
      } else {
        failedReason = `verification failed after ${maxAttempts} attempts: ${judgment.summary}`;
      }
    }

    if (success) {
      await config.executor.exec(handle, ["/magi/scripts/commit-push.sh"]);
      updateIssue(config.dbPath, issue.id, {
        status: "implemented",
        branch,
      });
    } else {
      updateIssue(config.dbPath, issue.id, {
        status: "failed",
        failed_reason: failedReason,
      });
    }
  } finally {
    await config.executor.stop(handle);
  }

  return {
    success,
    output,
    branch,
  };
}
