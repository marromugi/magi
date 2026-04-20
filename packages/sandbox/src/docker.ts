import { $ } from "bun";
import * as fs from "fs";
import { resolve } from "path";
import {
  type SandboxConfig,
  type SandboxResult,
  type SandboxHandle,
  type ExecResult,
  SANDBOX_IMAGE,
  DEFAULT_TIMEOUT,
} from "./types.js";

const DEFAULT_SETTINGS_PATH = resolve(import.meta.dir, "../settings.json");

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
 * Detect paths that exist on macOS but cannot be mounted by Docker Desktop.
 * Docker Desktop cannot mount macOS launchd-managed socket paths.
 */
function isDockerUnmountable(sockPath: string): boolean {
  return /\/com\.apple\.launchd\./.test(sockPath);
}

function buildSettingsMountArgs(settingsPath?: string): string[] {
  const filePath = settingsPath ?? DEFAULT_SETTINGS_PATH;
  if (!fs.existsSync(filePath)) return [];
  return ["-v", `${filePath}:/magi/settings.json:ro`];
}

function buildSshMountArgs(
  sshAuthSock: string | undefined,
  ghToken: string,
): string[] {
  if (!sshAuthSock) return [];
  if (fs.existsSync(sshAuthSock) && !isDockerUnmountable(sshAuthSock)) {
    return [
      "-v",
      `${sshAuthSock}:/ssh-agent:ro`,
      "-e",
      "SSH_AUTH_SOCK=/ssh-agent",
    ];
  }
  if (ghToken) {
    console.warn(
      `[sandbox] WARNING: SSH_AUTH_SOCK "${sshAuthSock}" is not accessible. Using GH_TOKEN authentication.`,
    );
  } else {
    console.error(
      `[sandbox] ERROR: SSH_AUTH_SOCK "${sshAuthSock}" is not accessible and GH_TOKEN is not set. Git authentication may fail.`,
    );
  }
  return [];
}

/**
 * Build common docker run args shared by runSandbox and startSandbox.
 */
function buildCommonRunArgs(
  config: SandboxConfig,
  containerName: string,
  ghToken: string,
): string[] {
  return [
    "--name",
    containerName,
    // Mount local repo as read-only
    "-v",
    `${config.repoPath}:/repo:ro`,
    // Mount sandbox-specific settings.json (POSIX-compatible hooks)
    ...buildSettingsMountArgs(config.settingsPath),
    // SSH agent forwarding for git auth (if available and socket is accessible)
    ...buildSshMountArgs(process.env["SSH_AUTH_SOCK"], ghToken),
    // Grant NET_ADMIN so init-firewall.sh can configure iptables rules
    ...(config.enableFirewall ? ["--cap-add", "NET_ADMIN"] : []),
  ];
}

/**
 * Build common environment variables shared by runSandbox and startSandbox.
 */
function buildCommonEnv(
  config: SandboxConfig,
  oauthToken: string,
  ghToken: string,
): Record<string, string> {
  const env: Record<string, string> = {
    BRANCH: config.branch,
    BASE_BRANCH: config.baseBranch ?? "main",
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

  return env;
}

/**
 * Append environment variables as -e flags to args array.
 */
function appendEnvArgs(args: string[], env: Record<string, string>): void {
  for (const [key, value] of Object.entries(env)) {
    args.push("-e", `${key}=${value}`);
  }
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

  const env = buildCommonEnv(config, oauthToken, ghToken);
  env["PROMPT"] = config.prompt;

  // Build docker run args
  const args: string[] = [
    "docker",
    "run",
    "--rm",
    ...buildCommonRunArgs(config, containerName, ghToken),
  ];

  appendEnvArgs(args, env);
  args.push(SANDBOX_IMAGE);

  const useCallback = !!config.onStreams;
  const streaming = !useCallback && (config.stream ?? false);
  const proc = Bun.spawn(args, {
    stdout: streaming ? "inherit" : "pipe",
    stderr: streaming ? "inherit" : "pipe",
  });

  // Timeout handling
  const timeoutId = setTimeout(() => {
    proc.kill();
  }, timeout);

  let output = "";
  if (useCallback) {
    output = await config.onStreams!(
      proc.stdout as ReadableStream<Uint8Array>,
      proc.stderr as ReadableStream<Uint8Array>,
    );
  } else if (!streaming) {
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
    ]);
    output = stdout + stderr;
  }
  const exitCode = await proc.exited;

  clearTimeout(timeoutId);

  const prUrlMatch = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  const sessionIdMatch = output.match(/\[magi-sandbox\].*?session-id: (\S+)/);

  return {
    success: exitCode === 0,
    exitCode,
    output,
    branch: config.branch,
    containerName,
    prUrl: prUrlMatch?.[0],
    sessionId: sessionIdMatch?.[1] ?? null,
  };
}

async function getContainerState(
  containerName: string,
): Promise<"running" | "stopped" | "not-found"> {
  const inspect = Bun.spawn(
    ["docker", "inspect", "-f", "{{.State.Running}}", containerName],
    { stdout: "pipe", stderr: "pipe" },
  );
  const exitCode = await inspect.exited;
  if (exitCode !== 0) return "not-found";
  const running = (
    await new Response(inspect.stdout as ReadableStream).text()
  ).trim();
  return running === "true" ? "running" : "stopped";
}

/**
 * Start a long-lived sandbox container in detached mode.
 * The container runs setup only (MODE=setup) and stays alive via sleep infinity.
 * If a container with the same name is already running, reuses it.
 * If a stopped container with the same name exists, removes it first.
 */
export async function startSandbox(
  config: SandboxConfig,
): Promise<SandboxHandle> {
  const containerName = config.containerName ?? generateContainerName();
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;

  const state = await getContainerState(containerName);

  if (state === "running") {
    await waitForSetup(containerName, timeout);
    return {
      containerName,
      branch: config.branch,
      baseBranch: config.baseBranch ?? "main",
    };
  }

  if (state === "stopped") {
    const rmProc = Bun.spawn(["docker", "rm", containerName], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await rmProc.exited;
  }

  const oauthToken =
    config.oauthToken ?? process.env["CLAUDE_CODE_OAUTH_TOKEN"] ?? "";
  const ghToken = config.ghToken ?? process.env["GH_TOKEN"] ?? "";

  const env = buildCommonEnv(config, oauthToken, ghToken);
  env["MODE"] = "setup";

  const args: string[] = [
    "docker",
    "run",
    "-d",
    ...buildCommonRunArgs(config, containerName, ghToken),
  ];

  appendEnvArgs(args, env);
  args.push(SANDBOX_IMAGE);

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeoutId = setTimeout(() => {
    proc.kill();
  }, timeout);

  const exitCode = await proc.exited;
  clearTimeout(timeoutId);

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr as ReadableStream).text();
    throw new Error(`Failed to start sandbox container: ${stderr}`);
  }

  // Wait for entrypoint setup to complete before returning
  await waitForSetup(containerName, timeout);

  return {
    containerName,
    branch: config.branch,
    baseBranch: config.baseBranch ?? "main",
  };
}

/**
 * Wait for the sandbox container's entrypoint setup to complete.
 * Polls for /tmp/setup-done marker file; throws if container crashes or times out.
 */
export async function waitForSetup(
  containerName: string,
  timeout = 120_000,
  interval = 500,
): Promise<void> {
  for (let elapsed = 0; elapsed < timeout; elapsed += interval) {
    // Check if setup-done marker exists
    const check = Bun.spawn(
      ["docker", "exec", containerName, "test", "-f", "/tmp/setup-done"],
      { stdout: "pipe", stderr: "pipe" },
    );
    if ((await check.exited) === 0) return;

    // Check if container is still running
    const inspect = Bun.spawn(
      ["docker", "inspect", "-f", "{{.State.Running}}", containerName],
      { stdout: "pipe", stderr: "pipe" },
    );
    await inspect.exited;
    const running = (
      await new Response(inspect.stdout as ReadableStream).text()
    ).trim();

    if (running !== "true") {
      const logs = Bun.spawn(["docker", "logs", containerName], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await logs.exited;
      const logOut = await new Response(logs.stdout as ReadableStream).text();
      const logErr = await new Response(logs.stderr as ReadableStream).text();
      throw new Error(
        `Sandbox container crashed during setup:\n${logOut}${logErr}`,
      );
    }

    await Bun.sleep(interval);
  }
  throw new Error(
    `Sandbox setup timed out after ${timeout}ms for container ${containerName}`,
  );
}

/**
 * Execute a command inside a running sandbox container.
 */
export async function execInSandbox(
  handle: SandboxHandle,
  command: string[],
  opts?: {
    timeout?: number;
    stream?: boolean;
    env?: Record<string, string>;
    onStreams?: (
      stdout: ReadableStream<Uint8Array>,
      stderr: ReadableStream<Uint8Array>,
    ) => Promise<{ stdout: string; stderr: string }>;
  },
): Promise<ExecResult> {
  const timeout = opts?.timeout ?? DEFAULT_TIMEOUT;

  const args: string[] = ["docker", "exec"];

  if (opts?.env) {
    for (const [key, value] of Object.entries(opts.env)) {
      args.push("-e", `${key}=${value}`);
    }
  }

  args.push(handle.containerName, ...command);

  const useCallback = !!opts?.onStreams;
  const streaming = !useCallback && (opts?.stream ?? false);
  const proc = Bun.spawn(args, {
    stdout: streaming ? "inherit" : "pipe",
    stderr: streaming ? "inherit" : "pipe",
  });

  const timeoutId = setTimeout(() => {
    proc.kill();
  }, timeout);

  let stdout = "";
  let stderr = "";
  if (useCallback) {
    const result = await opts!.onStreams!(
      proc.stdout as ReadableStream<Uint8Array>,
      proc.stderr as ReadableStream<Uint8Array>,
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } else if (!streaming) {
    [stdout, stderr] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
    ]);
  }
  const exitCode = await proc.exited;
  clearTimeout(timeoutId);

  return { exitCode, stdout, stderr };
}

/**
 * Stop and remove a sandbox container.
 */
export async function stopSandbox(handle: SandboxHandle): Promise<void> {
  await $`docker stop ${handle.containerName}`.quiet().nothrow();
  await $`docker rm ${handle.containerName}`.quiet().nothrow();
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
