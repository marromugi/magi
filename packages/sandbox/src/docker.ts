import { $ } from "bun";
import {
  type SandboxConfig,
  type SandboxResult,
  SANDBOX_IMAGE,
  DEFAULT_TIMEOUT,
} from "./types.js";

function generateContainerName(): string {
  const id = Math.random().toString(36).slice(2, 10);
  return `magi-sandbox-${id}`;
}

/**
 * Build the magi-sandbox Docker image.
 * Call this once before running sandboxes.
 */
export async function buildImage(dockerfilePath: string): Promise<void> {
  const contextDir = dockerfilePath.replace(/\/Dockerfile$/, "");
  const result =
    await $`docker build -t ${SANDBOX_IMAGE} -f ${dockerfilePath} ${contextDir}`.quiet();
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to build sandbox image: ${result.stderr.toString()}`,
    );
  }
}

/**
 * Check if the magi-sandbox image exists locally.
 */
export async function imageExists(): Promise<boolean> {
  const result = await $`docker image inspect ${SANDBOX_IMAGE}`
    .quiet()
    .nothrow();
  return result.exitCode === 0;
}

/**
 * Run a sandbox container with the given configuration.
 */
export async function runSandbox(
  config: SandboxConfig,
): Promise<SandboxResult> {
  const containerName = config.containerName ?? generateContainerName();
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;

  const oauthToken =
    config.oauthToken ?? process.env["CLAUDE_CODE_OAUTH_TOKEN"] ?? "";
  const ghToken = config.ghToken ?? process.env["GH_TOKEN"] ?? "";

  const env: Record<string, string> = {
    BRANCH: config.branch,
    BASE_BRANCH: config.baseBranch ?? "main",
    PROMPT: config.prompt,
    CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
    GH_TOKEN: ghToken,
    ENABLE_FIREWALL: String(config.enableFirewall ?? false),
    CREATE_PR: String(config.createPr ?? false),
  };

  if (config.commitMessage) env["COMMIT_MESSAGE"] = config.commitMessage;
  if (config.model) env["CLAUDE_MODEL"] = config.model;
  if (config.gitUserName) env["GIT_USER_NAME"] = config.gitUserName;
  if (config.gitUserEmail) env["GIT_USER_EMAIL"] = config.gitUserEmail;
  if (config.oauthToken) env["CLAUDE_CODE_OAUTH_TOKEN"] = config.oauthToken;
  if (config.ghToken) env["GH_TOKEN"] = config.ghToken;
  const prTitle = config.prTitle ?? config.commitMessage;
  if (prTitle) env["PR_TITLE"] = prTitle;
  if (config.prBody) env["PR_BODY"] = config.prBody;

  // Build docker run args
  const args: string[] = [
    "docker",
    "run",
    "--rm",
    "--name",
    containerName,
    // Mount local repo as read-only
    "-v",
    `${config.repoPath}:/repo:ro`,
    // SSH agent forwarding for git auth (if available)
    ...(process.env["SSH_AUTH_SOCK"]
      ? [
          "-v",
          `${process.env["SSH_AUTH_SOCK"]}:/ssh-agent:ro`,
          "-e",
          "SSH_AUTH_SOCK=/ssh-agent",
        ]
      : []),
    // Block external network access when firewall is enabled
    ...(config.enableFirewall ? ["--network", "none"] : []),
  ];

  // Add environment variables
  for (const [key, value] of Object.entries(env)) {
    args.push("-e", `${key}=${value}`);
  }

  args.push(SANDBOX_IMAGE);

  const streaming = config.stream ?? false;
  const proc = Bun.spawn(args, {
    stdout: streaming ? "inherit" : "pipe",
    stderr: streaming ? "inherit" : "pipe",
  });

  // Timeout handling
  const timeoutId = setTimeout(() => {
    proc.kill();
  }, timeout);

  let output = "";
  if (!streaming) {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
    ]);
    output = stdout + stderr;
  }
  const exitCode = await proc.exited;

  clearTimeout(timeoutId);

  const prUrlMatch = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);

  return {
    success: exitCode === 0,
    exitCode,
    output,
    branch: config.branch,
    containerName,
    prUrl: prUrlMatch?.[0],
  };
}

/**
 * Remove a running or stopped sandbox container.
 */
export async function removeSandbox(containerName: string): Promise<void> {
  await $`docker rm -f ${containerName}`.quiet().nothrow();
}

/**
 * List running sandbox containers.
 */
export async function listSandboxes(): Promise<string[]> {
  const result =
    await $`docker ps --filter name=magi-sandbox --format "{{.Names}}"`
      .quiet()
      .nothrow();
  if (result.exitCode !== 0) return [];
  return result.stdout
    .toString()
    .trim()
    .split("\n")
    .filter((n) => n.length > 0);
}
