import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as fs from "fs";
import {
  runSandbox,
  startSandbox,
  execInSandbox,
  stopSandbox,
} from "./docker.js";
import type { SandboxConfig, SandboxHandle } from "./types.js";

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

function dockerRunDArgs(spy: ReturnType<typeof spyOn>): string[] {
  for (const call of spy.mock.calls) {
    const args = call[0] as string[];
    if (
      args.includes("docker") &&
      args.includes("run") &&
      args.includes("-d")
    ) {
      return args;
    }
  }
  return [];
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

describe("runSandbox firewall args", () => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = makeSpawnMock();
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("adds --cap-add NET_ADMIN when enableFirewall is true", async () => {
    await runSandbox({ ...baseConfig, enableFirewall: true });
    const args = spawnArgs(spy);
    const capIdx = args.indexOf("--cap-add");
    expect(capIdx).toBeGreaterThan(-1);
    expect(args[capIdx + 1]).toBe("NET_ADMIN");
  });

  it("does not add --network none when enableFirewall is true", async () => {
    await runSandbox({ ...baseConfig, enableFirewall: true });
    const args = spawnArgs(spy);
    expect(args).not.toContain("--network");
    expect(args).not.toContain("none");
  });

  it("does not add --cap-add NET_ADMIN when enableFirewall is false", async () => {
    await runSandbox({ ...baseConfig, enableFirewall: false });
    const args = spawnArgs(spy);
    expect(args).not.toContain("--cap-add");
  });

  it("does not add --network none when enableFirewall is false", async () => {
    await runSandbox({ ...baseConfig, enableFirewall: false });
    const args = spawnArgs(spy);
    expect(args).not.toContain("--network");
  });

  it("does not add firewall args when enableFirewall is not set", async () => {
    await runSandbox(baseConfig);
    const args = spawnArgs(spy);
    expect(args).not.toContain("--cap-add");
    expect(args).not.toContain("--network");
  });
});

describe("runSandbox settings.json mount", () => {
  let spawnSpy: ReturnType<typeof spyOn>;
  let existsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spawnSpy = makeSpawnMock();
    delete process.env["SSH_AUTH_SOCK"];
  });

  afterEach(() => {
    spawnSpy.mockRestore();
    existsSpy?.mockRestore();
  });

  it("mounts default settings.json to /magi/settings.json when file exists", async () => {
    existsSpy = spyOn(fs, "existsSync").mockReturnValue(true);
    await runSandbox(baseConfig);
    const args = spawnArgs(spawnSpy);
    const magiMount = args.find((a) => a.endsWith(":/magi/settings.json:ro"));
    expect(magiMount).toBeTruthy();
    expect(magiMount).toMatch(/settings\.json:\/magi\/settings\.json:ro$/);
  });

  it("mounts custom settingsPath to /magi/settings.json when provided", async () => {
    existsSpy = spyOn(fs, "existsSync").mockReturnValue(true);
    await runSandbox({
      ...baseConfig,
      settingsPath: "/custom/my-settings.json",
    });
    const args = spawnArgs(spawnSpy);
    expect(args).toContain("/custom/my-settings.json:/magi/settings.json:ro");
  });

  it("skips settings mount when settings file does not exist", async () => {
    existsSpy = spyOn(fs, "existsSync").mockReturnValue(false);
    await runSandbox(baseConfig);
    const args = spawnArgs(spawnSpy);
    expect(args.some((a) => a.includes("/magi/settings.json"))).toBe(false);
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

// ── startSandbox tests ──

describe("startSandbox", () => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = makeSpawnMockWithOutput("container-id-abc\n");
    delete process.env["CLAUDE_CODE_OAUTH_TOKEN"];
    delete process.env["GH_TOKEN"];
    delete process.env["SSH_AUTH_SOCK"];
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("uses 'docker run -d' (detached) without --rm", async () => {
    await startSandbox({ ...baseConfig, containerName: "test-ctr" });
    const args = dockerRunDArgs(spy);
    expect(args).toContain("docker");
    expect(args).toContain("run");
    expect(args).toContain("-d");
    expect(args).not.toContain("--rm");
  });

  it("sets MODE=setup env var", async () => {
    await startSandbox({ ...baseConfig, containerName: "test-ctr" });
    const args = dockerRunDArgs(spy);
    const env = envArgs(args);
    expect(env["MODE"]).toBe("setup");
  });

  it("does NOT pass PROMPT env var", async () => {
    await startSandbox({ ...baseConfig, containerName: "test-ctr" });
    const args = dockerRunDArgs(spy);
    const env = envArgs(args);
    expect(env["PROMPT"]).toBeUndefined();
  });

  it("returns a SandboxHandle with containerName, branch, baseBranch", async () => {
    const handle = await startSandbox({
      ...baseConfig,
      containerName: "my-ctr",
      baseBranch: "develop",
    });
    expect(handle.containerName).toBe("my-ctr");
    expect(handle.branch).toBe("test-branch");
    expect(handle.baseBranch).toBe("develop");
  });

  it("defaults baseBranch to main", async () => {
    const handle = await startSandbox({
      ...baseConfig,
      containerName: "my-ctr",
    });
    expect(handle.baseBranch).toBe("main");
  });

  it("passes BRANCH and BASE_BRANCH env vars", async () => {
    await startSandbox({
      ...baseConfig,
      containerName: "test-ctr",
      baseBranch: "develop",
    });
    const args = dockerRunDArgs(spy);
    const env = envArgs(args);
    expect(env["BRANCH"]).toBe("test-branch");
    expect(env["BASE_BRANCH"]).toBe("develop");
  });

  it("mounts repo as read-only", async () => {
    await startSandbox({ ...baseConfig, containerName: "test-ctr" });
    const args = dockerRunDArgs(spy);
    expect(args).toContain("/workspace/repo:/repo:ro");
  });
});

// ── startSandbox container existence handling ──

describe("startSandbox container existence handling", () => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    delete process.env["CLAUDE_CODE_OAUTH_TOKEN"];
    delete process.env["GH_TOKEN"];
    delete process.env["SSH_AUTH_SOCK"];
  });

  afterEach(() => {
    spy.mockRestore();
  });

  function makeContainerStateMock(state: "running" | "stopped" | "not-found") {
    return spyOn(Bun, "spawn").mockImplementation((args) => {
      const cmd = (args as string[]).join(" ");
      if (cmd.includes("inspect") && cmd.includes("State.Running")) {
        if (state === "not-found") {
          return {
            stdout: new Response("").body as ReadableStream,
            stderr: new Response("").body as ReadableStream,
            exited: Promise.resolve(1),
            kill: () => {},
          } as ReturnType<typeof Bun.spawn>;
        }
        return {
          stdout: new Response(state === "running" ? "true\n" : "false\n")
            .body as ReadableStream,
          stderr: new Response("").body as ReadableStream,
          exited: Promise.resolve(0),
          kill: () => {},
        } as ReturnType<typeof Bun.spawn>;
      }
      if (cmd.includes("test -f")) {
        return {
          stdout: null,
          stderr: null,
          exited: Promise.resolve(0),
          kill: () => {},
        } as ReturnType<typeof Bun.spawn>;
      }
      return {
        stdout: new Response("container-id\n").body as ReadableStream,
        stderr: new Response("").body as ReadableStream,
        exited: Promise.resolve(0),
        kill: () => {},
      } as ReturnType<typeof Bun.spawn>;
    });
  }

  it("creates new container when no existing container found", async () => {
    spy = makeContainerStateMock("not-found");
    await startSandbox({ ...baseConfig, containerName: "test-ctr" });
    const runCall = spy.mock.calls.find((c) => {
      const args = c[0] as string[];
      return args.includes("run") && args.includes("-d");
    });
    expect(runCall).toBeTruthy();
  });

  it("removes stopped container before creating new one", async () => {
    spy = makeContainerStateMock("stopped");
    await startSandbox({ ...baseConfig, containerName: "test-ctr" });
    const rmCall = spy.mock.calls.find((c) => {
      const args = c[0] as string[];
      return args.includes("rm") && args.includes("test-ctr");
    });
    expect(rmCall).toBeTruthy();
    const runCall = spy.mock.calls.find((c) => {
      const args = c[0] as string[];
      return args.includes("run") && args.includes("-d");
    });
    expect(runCall).toBeTruthy();
  });

  it("does not create new container when existing container is running", async () => {
    spy = makeContainerStateMock("running");
    await startSandbox({ ...baseConfig, containerName: "test-ctr" });
    const runCall = spy.mock.calls.find((c) => {
      const args = c[0] as string[];
      return args.includes("run");
    });
    expect(runCall).toBeUndefined();
  });

  it("returns correct handle when reusing running container", async () => {
    spy = makeContainerStateMock("running");
    const handle = await startSandbox({
      ...baseConfig,
      containerName: "test-ctr",
      baseBranch: "develop",
    });
    expect(handle.containerName).toBe("test-ctr");
    expect(handle.branch).toBe("test-branch");
    expect(handle.baseBranch).toBe("develop");
  });

  it("calls waitForSetup when reusing running container", async () => {
    spy = makeContainerStateMock("running");
    await startSandbox({ ...baseConfig, containerName: "test-ctr" });
    const setupCall = spy.mock.calls.find((c) => {
      const args = c[0] as string[];
      return args.includes("test") && args.includes("-f");
    });
    expect(setupCall).toBeTruthy();
  });
});

// ── execInSandbox tests ──

describe("execInSandbox", () => {
  let spy: ReturnType<typeof spyOn>;
  const handle: SandboxHandle = {
    containerName: "magi-sandbox-test",
    branch: "feat/1-test",
    baseBranch: "main",
  };

  afterEach(() => {
    spy.mockRestore();
  });

  it("runs docker exec with the container name and command", async () => {
    spy = makeSpawnMockWithOutput("hello\n");
    const result = await execInSandbox(handle, ["echo", "hello"]);
    const args = spawnArgs(spy);
    expect(args[0]).toBe("docker");
    expect(args[1]).toBe("exec");
    expect(args).toContain("magi-sandbox-test");
    expect(args).toContain("echo");
    expect(args).toContain("hello");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello");
  });

  it("returns non-zero exit code on failure", async () => {
    spy = makeSpawnMockWithOutput("error\n", 1);
    const result = await execInSandbox(handle, ["false"]);
    expect(result.exitCode).toBe(1);
  });

  it("passes env vars with -e flags when provided", async () => {
    spy = makeSpawnMockWithOutput("");
    await execInSandbox(handle, ["cmd"], {
      env: { FOO: "bar", BAZ: "qux" },
    });
    const args = spawnArgs(spy);
    expect(args).toContain("-e");
    expect(args).toContain("FOO=bar");
    expect(args).toContain("BAZ=qux");
  });
});

// ── waitForSetup tests ──

describe("waitForSetup", () => {
  let shellSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    shellSpy?.mockRestore();
  });

  it("resolves when setup-done marker exists", async () => {
    const { waitForSetup } = await import("./docker.js");
    // 1st call: docker exec test -f → success
    shellSpy = spyOn(Bun, "spawn").mockImplementation((args) => {
      const cmd = (args as string[]).join(" ");
      if (cmd.includes("test -f")) {
        return {
          stdout: null,
          stderr: null,
          exited: Promise.resolve(0),
          kill: () => {},
        } as ReturnType<typeof Bun.spawn>;
      }
      throw new Error(`Unexpected spawn: ${cmd}`);
    });
    await expect(waitForSetup("test-ctr", 5000, 100)).resolves.toBeUndefined();
  });

  it("throws when container stops running during setup", async () => {
    const { waitForSetup } = await import("./docker.js");
    shellSpy = spyOn(Bun, "spawn").mockImplementation((args) => {
      const cmd = (args as string[]).join(" ");
      if (cmd.includes("test -f")) {
        // marker not found
        return {
          stdout: null,
          stderr: null,
          exited: Promise.resolve(1),
          kill: () => {},
        } as ReturnType<typeof Bun.spawn>;
      }
      if (cmd.includes("inspect")) {
        // container not running
        return {
          stdout: new Response("false\n").body as ReadableStream,
          stderr: new Response("").body as ReadableStream,
          exited: Promise.resolve(0),
          kill: () => {},
        } as ReturnType<typeof Bun.spawn>;
      }
      if (cmd.includes("docker logs")) {
        return {
          stdout: new Response("setup log output").body as ReadableStream,
          stderr: new Response("setup error").body as ReadableStream,
          exited: Promise.resolve(0),
          kill: () => {},
        } as ReturnType<typeof Bun.spawn>;
      }
      throw new Error(`Unexpected spawn: ${cmd}`);
    });
    await expect(waitForSetup("test-ctr", 5000, 100)).rejects.toThrow(
      /crashed during setup/,
    );
  });

  it("throws on timeout when container stays running but never becomes ready", async () => {
    const { waitForSetup } = await import("./docker.js");
    shellSpy = spyOn(Bun, "spawn").mockImplementation((args) => {
      const cmd = (args as string[]).join(" ");
      if (cmd.includes("test -f")) {
        return {
          stdout: null,
          stderr: null,
          exited: Promise.resolve(1),
          kill: () => {},
        } as ReturnType<typeof Bun.spawn>;
      }
      if (cmd.includes("inspect")) {
        return {
          stdout: new Response("true\n").body as ReadableStream,
          stderr: new Response("").body as ReadableStream,
          exited: Promise.resolve(0),
          kill: () => {},
        } as ReturnType<typeof Bun.spawn>;
      }
      throw new Error(`Unexpected spawn: ${cmd}`);
    });
    await expect(waitForSetup("test-ctr", 300, 100)).rejects.toThrow(
      /timed out/,
    );
  });
});

// ── stopSandbox tests ──

describe("stopSandbox", () => {
  it("is a function that accepts a SandboxHandle", () => {
    expect(typeof stopSandbox).toBe("function");
  });
});
