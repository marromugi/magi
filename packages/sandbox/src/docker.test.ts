import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { runSandbox } from "./docker.js";
import type { SandboxConfig } from "./types.js";

function makeSpawnMock(exitCode = 0) {
  return spyOn(Bun, "spawn").mockImplementation(() => {
    return {
      stdout: null,
      stderr: null,
      exited: Promise.resolve(exitCode),
      kill: () => {},
    } as ReturnType<typeof Bun.spawn>;
  });
}

function spawnArgs(spy: ReturnType<typeof spyOn>): string[] {
  return spy.mock.calls[0][0] as string[];
}

function envArgs(args: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === "-e") {
      const [key, ...rest] = args[i + 1].split("=");
      env[key] = rest.join("=");
    }
  }
  return env;
}

const baseConfig: SandboxConfig = {
  repoPath: "/workspace/repo",
  branch: "test-branch",
  prompt: "do something",
};

describe("runSandbox env vars", () => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = makeSpawnMock();
    delete process.env["CLAUDE_CODE_OAUTH_TOKEN"];
    delete process.env["GH_TOKEN"];
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("passes oauthToken as CLAUDE_CODE_OAUTH_TOKEN", async () => {
    await runSandbox({ ...baseConfig, oauthToken: "my-oauth-token" });
    const env = envArgs(spawnArgs(spy));
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBe("my-oauth-token");
  });

  it("falls back to process.env.CLAUDE_CODE_OAUTH_TOKEN when oauthToken omitted", async () => {
    process.env["CLAUDE_CODE_OAUTH_TOKEN"] = "env-oauth-token";
    await runSandbox(baseConfig);
    const env = envArgs(spawnArgs(spy));
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBe("env-oauth-token");
  });

  it("passes ghToken as GH_TOKEN", async () => {
    await runSandbox({ ...baseConfig, ghToken: "my-gh-token" });
    const env = envArgs(spawnArgs(spy));
    expect(env["GH_TOKEN"]).toBe("my-gh-token");
  });

  it("falls back to process.env.GH_TOKEN when ghToken omitted", async () => {
    process.env["GH_TOKEN"] = "env-gh-token";
    await runSandbox(baseConfig);
    const env = envArgs(spawnArgs(spy));
    expect(env["GH_TOKEN"]).toBe("env-gh-token");
  });

  it("passes ENABLE_FIREWALL=true when enableFirewall is true", async () => {
    await runSandbox({ ...baseConfig, enableFirewall: true });
    const env = envArgs(spawnArgs(spy));
    expect(env["ENABLE_FIREWALL"]).toBe("true");
  });

  it("passes ENABLE_FIREWALL=false by default", async () => {
    await runSandbox(baseConfig);
    const env = envArgs(spawnArgs(spy));
    expect(env["ENABLE_FIREWALL"]).toBe("false");
  });

  it("passes ENABLE_FIREWALL=false when enableFirewall is false", async () => {
    await runSandbox({ ...baseConfig, enableFirewall: false });
    const env = envArgs(spawnArgs(spy));
    expect(env["ENABLE_FIREWALL"]).toBe("false");
  });
});

describe("runSandbox mounts", () => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = makeSpawnMock();
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("does not mount ~/.claude directory", async () => {
    await runSandbox(baseConfig);
    const args = spawnArgs(spy);
    const hasClaudeMount = args.some((a) => a.includes(".claude"));
    expect(hasClaudeMount).toBe(false);
  });
});
