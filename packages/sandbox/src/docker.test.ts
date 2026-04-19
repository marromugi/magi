import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as fs from "fs";
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

describe("runSandbox PR creation env vars", () => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = makeSpawnMock();
    delete process.env["CLAUDE_CODE_OAUTH_TOKEN"];
    delete process.env["GH_TOKEN"];
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("passes CREATE_PR=true when createPr is true", async () => {
    await runSandbox({ ...baseConfig, createPr: true });
    const env = envArgs(spawnArgs(spy));
    expect(env["CREATE_PR"]).toBe("true");
  });

  it("passes CREATE_PR=false by default", async () => {
    await runSandbox(baseConfig);
    const env = envArgs(spawnArgs(spy));
    expect(env["CREATE_PR"]).toBe("false");
  });

  it("passes CREATE_PR=false when createPr is false", async () => {
    await runSandbox({ ...baseConfig, createPr: false });
    const env = envArgs(spawnArgs(spy));
    expect(env["CREATE_PR"]).toBe("false");
  });

  it("passes PR_TITLE when prTitle is set", async () => {
    await runSandbox({ ...baseConfig, prTitle: "My PR Title" });
    const env = envArgs(spawnArgs(spy));
    expect(env["PR_TITLE"]).toBe("My PR Title");
  });

  it("does not pass PR_TITLE when prTitle is not set", async () => {
    await runSandbox(baseConfig);
    const env = envArgs(spawnArgs(spy));
    expect(env["PR_TITLE"]).toBeUndefined();
  });

  it("passes PR_BODY when prBody is set", async () => {
    await runSandbox({ ...baseConfig, prBody: "PR description" });
    const env = envArgs(spawnArgs(spy));
    expect(env["PR_BODY"]).toBe("PR description");
  });

  it("does not pass PR_BODY when prBody is not set", async () => {
    await runSandbox(baseConfig);
    const env = envArgs(spawnArgs(spy));
    expect(env["PR_BODY"]).toBeUndefined();
  });
});

describe("runSandbox prTitle fallback", () => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = makeSpawnMock();
    delete process.env["CLAUDE_CODE_OAUTH_TOKEN"];
    delete process.env["GH_TOKEN"];
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("uses commitMessage as PR_TITLE fallback when prTitle is not set", async () => {
    await runSandbox({
      ...baseConfig,
      commitMessage: "feat: my commit",
      createPr: true,
    });
    const env = envArgs(spawnArgs(spy));
    expect(env["PR_TITLE"]).toBe("feat: my commit");
  });

  it("uses prTitle over commitMessage when both are set", async () => {
    await runSandbox({
      ...baseConfig,
      commitMessage: "feat: my commit",
      prTitle: "My PR Title",
      createPr: true,
    });
    const env = envArgs(spawnArgs(spy));
    expect(env["PR_TITLE"]).toBe("My PR Title");
  });

  it("does not set PR_TITLE when neither prTitle nor commitMessage is set", async () => {
    await runSandbox({ ...baseConfig, createPr: true });
    const env = envArgs(spawnArgs(spy));
    expect(env["PR_TITLE"]).toBeUndefined();
  });
});

function makeSpawnMockWithOutput(stdout: string, exitCode = 0) {
  return spyOn(Bun, "spawn").mockImplementation(() => {
    return {
      stdout: new Response(stdout).body as ReadableStream,
      stderr: new Response("").body as ReadableStream,
      exited: Promise.resolve(exitCode),
      kill: () => {},
    } as ReturnType<typeof Bun.spawn>;
  });
}

describe("runSandbox session-id parsing", () => {
  let spy: ReturnType<typeof spyOn>;

  afterEach(() => {
    spy.mockRestore();
  });

  it("parses session-id from output and sets sessionId", async () => {
    spy = makeSpawnMockWithOutput(
      "[magi-sandbox] 2026-04-19 10:30:00 session-id: abc123-def456-session",
    );
    const result = await runSandbox(baseConfig);
    expect(result.sessionId).toBe("abc123-def456-session");
  });

  it("returns null sessionId when output has no session-id line", async () => {
    spy = makeSpawnMockWithOutput("Some output without session id marker");
    const result = await runSandbox(baseConfig);
    expect(result.sessionId).toBeNull();
  });

  it("parses session-id alongside PR URL in the same output", async () => {
    spy = makeSpawnMockWithOutput(
      "[magi-sandbox] 2026-04-19 10:30:00 session-id: my-session-xyz\nhttps://github.com/owner/repo/pull/42",
    );
    const result = await runSandbox(baseConfig);
    expect(result.sessionId).toBe("my-session-xyz");
    expect(result.prUrl).toBe("https://github.com/owner/repo/pull/42");
  });

  it("returns null sessionId when container exits with non-zero", async () => {
    spy = makeSpawnMockWithOutput("Error occurred", 1);
    const result = await runSandbox(baseConfig);
    expect(result.sessionId).toBeNull();
  });
});

describe("runSandbox PR URL parsing", () => {
  let spy: ReturnType<typeof spyOn>;

  afterEach(() => {
    spy.mockRestore();
  });

  it("parses PR URL from stdout and sets prUrl", async () => {
    spy = makeSpawnMockWithOutput(
      "Some output\nhttps://github.com/owner/repo/pull/42\nMore output",
    );
    const result = await runSandbox(baseConfig);
    expect(result.prUrl).toBe("https://github.com/owner/repo/pull/42");
  });

  it("sets prUrl to undefined when no PR URL in output", async () => {
    spy = makeSpawnMockWithOutput("Some output without PR URL");
    const result = await runSandbox(baseConfig);
    expect(result.prUrl).toBeUndefined();
  });

  it("returns success and prUrl together when PR is created", async () => {
    spy = makeSpawnMockWithOutput("https://github.com/org/project/pull/99", 0);
    const result = await runSandbox(baseConfig);
    expect(result.success).toBe(true);
    expect(result.prUrl).toBe("https://github.com/org/project/pull/99");
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

describe("runSandbox SSH_AUTH_SOCK handling", () => {
  let spawnSpy: ReturnType<typeof spyOn>;
  let existsSpy: ReturnType<typeof spyOn> | undefined;

  beforeEach(() => {
    spawnSpy = makeSpawnMock();
    existsSpy = undefined;
    delete process.env["SSH_AUTH_SOCK"];
    delete process.env["GH_TOKEN"];
    delete process.env["CLAUDE_CODE_OAUTH_TOKEN"];
  });

  afterEach(() => {
    spawnSpy.mockRestore();
    existsSpy?.mockRestore();
  });

  it("mounts SSH_AUTH_SOCK when set and socket path exists", async () => {
    process.env["SSH_AUTH_SOCK"] = "/tmp/ssh-agent.sock";
    existsSpy = spyOn(fs, "existsSync").mockReturnValue(true);
    await runSandbox(baseConfig);
    const args = spawnArgs(spawnSpy);
    expect(args).toContain("/tmp/ssh-agent.sock:/ssh-agent:ro");
    expect(envArgs(args)["SSH_AUTH_SOCK"]).toBe("/ssh-agent");
  });

  it("skips SSH mount when SSH_AUTH_SOCK is a macOS launchd socket path", async () => {
    process.env["SSH_AUTH_SOCK"] =
      "/private/tmp/com.apple.launchd.abc123/Listeners";
    process.env["GH_TOKEN"] = "my-gh-token";
    existsSpy = spyOn(fs, "existsSync").mockReturnValue(true);
    await runSandbox(baseConfig);
    const args = spawnArgs(spawnSpy);
    expect(args.some((a) => a.includes("ssh-agent"))).toBe(false);
  });

  it("skips SSH mount when SSH_AUTH_SOCK path does not exist and GH_TOKEN is set", async () => {
    process.env["SSH_AUTH_SOCK"] = "/nonexistent/ssh.sock";
    process.env["GH_TOKEN"] = "my-gh-token";
    existsSpy = spyOn(fs, "existsSync").mockReturnValue(false);
    await runSandbox(baseConfig);
    const args = spawnArgs(spawnSpy);
    expect(args.some((a) => a.includes("ssh-agent"))).toBe(false);
  });

  it("skips SSH mount when SSH_AUTH_SOCK path does not exist and GH_TOKEN is not set", async () => {
    process.env["SSH_AUTH_SOCK"] = "/nonexistent/ssh.sock";
    existsSpy = spyOn(fs, "existsSync").mockReturnValue(false);
    await runSandbox(baseConfig);
    const args = spawnArgs(spawnSpy);
    expect(args.some((a) => a.includes("ssh-agent"))).toBe(false);
  });

  it("logs warning when SSH_AUTH_SOCK inaccessible but GH_TOKEN is available", async () => {
    process.env["SSH_AUTH_SOCK"] = "/nonexistent/ssh.sock";
    process.env["GH_TOKEN"] = "my-gh-token";
    existsSpy = spyOn(fs, "existsSync").mockReturnValue(false);
    const warnSpy = spyOn(console, "warn");
    await runSandbox(baseConfig);
    expect(warnSpy.mock.calls.length).toBeGreaterThan(0);
    warnSpy.mockRestore();
  });

  it("logs error when SSH_AUTH_SOCK inaccessible and GH_TOKEN is not set", async () => {
    process.env["SSH_AUTH_SOCK"] = "/nonexistent/ssh.sock";
    existsSpy = spyOn(fs, "existsSync").mockReturnValue(false);
    const errorSpy = spyOn(console, "error");
    await runSandbox(baseConfig);
    expect(errorSpy.mock.calls.length).toBeGreaterThan(0);
    errorSpy.mockRestore();
  });

  it("does not mount SSH agent when SSH_AUTH_SOCK is not set", async () => {
    await runSandbox(baseConfig);
    const args = spawnArgs(spawnSpy);
    expect(args.some((a) => a.includes("ssh-agent"))).toBe(false);
  });
});
