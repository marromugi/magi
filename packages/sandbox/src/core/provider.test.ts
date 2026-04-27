import { describe, it, expect } from "bun:test";
import type { Sandbox, SandboxProvider } from "./provider";
import type { SandboxConfig, ExecResult, SandboxStatus } from "./types";

class MockSandbox implements Sandbox {
  id: string;
  private _status: SandboxStatus = "stopped";

  constructor(id: string) {
    this.id = id;
  }

  async start() {
    this._status = "running";
  }
  async stop() {
    this._status = "stopped";
  }
  async status() {
    return this._status;
  }
  async exec(command: string, args?: string[]): Promise<ExecResult> {
    return {
      exitCode: 0,
      stdout: `executed: ${command} ${(args ?? []).join(" ")}`.trim(),
      stderr: "",
    };
  }
}

class MockProvider implements SandboxProvider {
  name = "mock";
  private sandboxes = new Map<string, MockSandbox>();

  async create(config: SandboxConfig): Promise<Sandbox> {
    const sandbox = new MockSandbox(config.name);
    this.sandboxes.set(config.name, sandbox);
    return sandbox;
  }

  async get(id: string): Promise<Sandbox | null> {
    return this.sandboxes.get(id) ?? null;
  }

  async list(): Promise<Sandbox[]> {
    return [...this.sandboxes.values()];
  }
}

describe("SandboxProvider interface", () => {
  it("creates a sandbox", async () => {
    const provider = new MockProvider();
    const sandbox = await provider.create({
      name: "test",
      image: "node:22",
    });
    expect(sandbox.id).toBe("test");
  });

  it("manages sandbox lifecycle", async () => {
    const provider = new MockProvider();
    const sandbox = await provider.create({
      name: "lifecycle",
      image: "python",
    });

    expect(await sandbox.status()).toBe("stopped");

    await sandbox.start();
    expect(await sandbox.status()).toBe("running");

    await sandbox.stop();
    expect(await sandbox.status()).toBe("stopped");
  });

  it("executes commands in sandbox", async () => {
    const provider = new MockProvider();
    const sandbox = await provider.create({
      name: "exec-test",
      image: "node:22",
    });
    await sandbox.start();

    const result = await sandbox.exec("echo", ["hello"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("executed: echo hello");
  });

  it("retrieves sandbox by id", async () => {
    const provider = new MockProvider();
    await provider.create({ name: "find-me", image: "node:22" });

    const found = await provider.get("find-me");
    expect(found).not.toBeNull();
    expect(found!.id).toBe("find-me");

    const missing = await provider.get("nonexistent");
    expect(missing).toBeNull();
  });

  it("lists all sandboxes", async () => {
    const provider = new MockProvider();
    await provider.create({ name: "a", image: "node:22" });
    await provider.create({ name: "b", image: "python" });

    const all = await provider.list();
    expect(all).toHaveLength(2);
  });
});
