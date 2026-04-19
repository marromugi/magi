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
  /** OAuth token for Claude Code auth (default: process.env.CLAUDE_CODE_OAUTH_TOKEN) */
  oauthToken?: string;
  /** GitHub token for git auth (default: process.env.GH_TOKEN) */
  ghToken?: string;
  /** Enable network firewall in container (default: false) */
  enableFirewall?: boolean;
  /** Container name (auto-generated if omitted) */
  containerName?: string;
  /** Timeout in milliseconds (default: 600000 = 10 min) */
  timeout?: number;
  /** Stream stdout/stderr directly to terminal instead of buffering */
  stream?: boolean;
  /** Create a GitHub PR after push (default: false) */
  createPr?: boolean;
  /** PR title (used when createPr is true) */
  prTitle?: string;
  /** PR body (used when createPr is true) */
  prBody?: string;
  /** Path to settings.json to inject into the container (default: package built-in) */
  settingsPath?: string;
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
  /** PR URL if a PR was created, undefined otherwise */
  prUrl?: string;
  /** Claude Code session ID captured from the container, null if not captured */
  sessionId: string | null;
}

export const SANDBOX_IMAGE = "magi-sandbox:latest";

export const DEFAULT_TIMEOUT = 600_000; // 10 minutes
