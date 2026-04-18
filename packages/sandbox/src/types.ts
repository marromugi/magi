export interface SandboxConfig {
  /** Path to local git repository to mount */
  repoPath: string;
  /** Branch name to create for this sandbox */
  branch: string;
  /** Base branch to checkout from (default: "main") */
  baseBranch?: string;
  /** Prompt to pass to Claude Code */
  prompt: string;
  /** Commit message for the changes */
  commitMessage?: string;
  /** Claude model to use (optional) */
  model?: string;
  /** Git user name (default: "magi-sandbox") */
  gitUserName?: string;
  /** Git user email (default: "magi-sandbox@localhost") */
  gitUserEmail?: string;
  /** Path to host ~/.claude directory for OAuth auth */
  claudeConfigPath?: string;
  /** Container name (auto-generated if omitted) */
  containerName?: string;
  /** Timeout in milliseconds (default: 600000 = 10 min) */
  timeout?: number;
}

export interface SandboxResult {
  /** Whether the sandbox completed successfully */
  success: boolean;
  /** Container exit code */
  exitCode: number;
  /** Combined stdout/stderr output */
  output: string;
  /** Branch name that was pushed (if successful) */
  branch: string;
  /** Container name used */
  containerName: string;
}

export const SANDBOX_IMAGE = "magi-sandbox:latest";

export const DEFAULT_TIMEOUT = 600_000; // 10 minutes
