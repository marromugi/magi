import { updateIssue } from "./issue.js";
import type { Issue } from "./issue.js";

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

export type SandboxRunner = (config: SandboxRunConfig) => Promise<SandboxRunResult>;

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
    updateIssue(config.dbPath, issue.id, { status: "done", branch: result.branch });
  } else {
    updateIssue(config.dbPath, issue.id, { status: "blocked" });
  }

  return {
    success: result.success,
    output: result.output,
    branch: result.branch,
  };
}
