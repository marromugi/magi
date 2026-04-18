import { describe, test, expect } from "bun:test";
import {
  resolveGhToken,
  resolveOauthToken,
  buildSandboxConfig,
} from "./sandbox-helpers";

describe("resolveGhToken", () => {
  test("returns GH_TOKEN env var when set", async () => {
    const orig = process.env.GH_TOKEN;
    process.env.GH_TOKEN = "env-gh-token";
    try {
      const token = await resolveGhToken();
      expect(token).toBe("env-gh-token");
    } finally {
      if (orig === undefined) delete process.env.GH_TOKEN;
      else process.env.GH_TOKEN = orig;
    }
  });

  test("calls gh auth token and returns stdout when GH_TOKEN not set", async () => {
    const orig = process.env.GH_TOKEN;
    delete process.env.GH_TOKEN;
    try {
      const mockSpawn = () =>
        ({
          exitCode: 0,
          stdout: Buffer.from("gh-spawned-token\n"),
          stderr: Buffer.from(""),
        }) as ReturnType<typeof Bun.spawnSync>;
      const token = await resolveGhToken(mockSpawn);
      expect(token).toBe("gh-spawned-token");
    } finally {
      if (orig !== undefined) process.env.GH_TOKEN = orig;
    }
  });

  test("returns undefined when gh auth token command fails", async () => {
    const orig = process.env.GH_TOKEN;
    delete process.env.GH_TOKEN;
    try {
      const mockSpawn = () =>
        ({
          exitCode: 1,
          stdout: Buffer.from(""),
          stderr: Buffer.from("not logged in"),
        }) as ReturnType<typeof Bun.spawnSync>;
      const token = await resolveGhToken(mockSpawn);
      expect(token).toBeUndefined();
    } finally {
      if (orig !== undefined) process.env.GH_TOKEN = orig;
    }
  });
});

describe("resolveOauthToken", () => {
  test("returns CLAUDE_CODE_OAUTH_TOKEN when set", () => {
    const orig = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-123";
    try {
      expect(resolveOauthToken()).toBe("oauth-123");
    } finally {
      if (orig === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
      else process.env.CLAUDE_CODE_OAUTH_TOKEN = orig;
    }
  });

  test("returns undefined when CLAUDE_CODE_OAUTH_TOKEN not set", () => {
    const orig = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    try {
      expect(resolveOauthToken()).toBeUndefined();
    } finally {
      if (orig !== undefined) process.env.CLAUDE_CODE_OAUTH_TOKEN = orig;
    }
  });
});

describe("buildSandboxConfig", () => {
  test("builds config with required fields", () => {
    const config = buildSandboxConfig(
      "/repo",
      { branch: "feat/test", prompt: "do something" },
      "oauth-tok",
      undefined,
    );
    expect(config.repoPath).toBe("/repo");
    expect(config.branch).toBe("feat/test");
    expect(config.prompt).toBe("do something");
    expect(config.oauthToken).toBe("oauth-tok");
    expect(config.ghToken).toBeUndefined();
  });

  test("passes ghToken when provided", () => {
    const config = buildSandboxConfig(
      "/repo",
      { branch: "b", prompt: "p" },
      "oauth",
      "gh-token",
    );
    expect(config.ghToken).toBe("gh-token");
  });

  test("sets enableFirewall to true when flag is set", () => {
    const config = buildSandboxConfig(
      "/repo",
      { branch: "b", prompt: "p", "enable-firewall": "true" },
      "oauth",
      undefined,
    );
    expect(config.enableFirewall).toBe(true);
  });

  test("sets enableFirewall to false when flag not set", () => {
    const config = buildSandboxConfig(
      "/repo",
      { branch: "b", prompt: "p" },
      "oauth",
      undefined,
    );
    expect(config.enableFirewall).toBe(false);
  });

  test("converts timeout from seconds to milliseconds", () => {
    const config = buildSandboxConfig(
      "/repo",
      { branch: "b", prompt: "p", timeout: "30" },
      "oauth",
      undefined,
    );
    expect(config.timeout).toBe(30000);
  });

  test("sets optional fields from flags", () => {
    const config = buildSandboxConfig(
      "/repo",
      {
        branch: "b",
        prompt: "p",
        "base-branch": "develop",
        "commit-message": "fix: something",
        model: "claude-opus-4-7",
        name: "my-sandbox",
      },
      "oauth",
      undefined,
    );
    expect(config.baseBranch).toBe("develop");
    expect(config.commitMessage).toBe("fix: something");
    expect(config.model).toBe("claude-opus-4-7");
    expect(config.containerName).toBe("my-sandbox");
  });

  test("leaves optional fields undefined when not in flags", () => {
    const config = buildSandboxConfig(
      "/repo",
      { branch: "b", prompt: "p" },
      "oauth",
      undefined,
    );
    expect(config.baseBranch).toBeUndefined();
    expect(config.commitMessage).toBeUndefined();
    expect(config.model).toBeUndefined();
    expect(config.containerName).toBeUndefined();
    expect(config.timeout).toBeUndefined();
  });
});
