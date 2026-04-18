import type { SandboxConfig } from "@magi/sandbox";

type SpawnSyncFn = typeof Bun.spawnSync;

export async function resolveGhToken(
  spawnSync: SpawnSyncFn = Bun.spawnSync,
): Promise<string | undefined> {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  const result = spawnSync(["gh", "auth", "token"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode === 0) return result.stdout.toString().trim();
  return undefined;
}

export function resolveOauthToken(): string | undefined {
  return process.env.CLAUDE_CODE_OAUTH_TOKEN;
}

export function buildSandboxConfig(
  repoPath: string,
  flags: Record<string, string>,
  oauthToken: string,
  ghToken: string | undefined,
): SandboxConfig {
  return {
    repoPath,
    branch: flags.branch!,
    baseBranch: flags["base-branch"],
    prompt: flags.prompt!,
    commitMessage: flags["commit-message"],
    model: flags.model,
    timeout: flags.timeout ? Number(flags.timeout) * 1000 : undefined,
    containerName: flags.name,
    enableFirewall: flags["enable-firewall"] === "true",
    oauthToken,
    ghToken,
  };
}
