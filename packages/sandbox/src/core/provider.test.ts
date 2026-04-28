import { describe, it, expect } from "bun:test";
import type { Sandbox, SandboxProvider } from "./provider";
import type {
  SandboxConfig,
  ExecResult,
  SandboxStatus,
  SnapshotInfo,
} from "./types";

class MockSandbox implements Sandbox {
  id: string;
  private _status: SandboxStatus = "stopped";
  private _snapshots: SnapshotInfo[] = [];

  constructor(id: string) {
    this.id = id;
  }

  async start() {
    this._status = "running";
  }
  async stop() {
    this._status = "stopped";
  }
  async reset() {
    this._status = "stopped";
    this._snapshots = [];
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
  async snapshot(tag?: string): Promise<SnapshotInfo> {
    const info: SnapshotInfo = {
      id: `snap-${this._snapshots.length}`,
      tag: tag ?? "latest",
      createdAt: new Date().toISOString(),
    };
    this._snapshots.push(info);
    return info;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async restore(_tag: string): Promise<void> {
    this._status = "stopped";
  }
  getSnapshots(): SnapshotInfo[] {
    return this._snapshots;
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

  async snapshots(sandboxId: string): Promise<SnapshotInfo[]> {
    const sb = this.sandboxes.get(sandboxId);
    return sb ? sb.getSnapshots() : [];
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

  it("resets sandbox to initial state", async () => {
    const provider = new MockProvider();
    const sandbox = await provider.create({
      name: "reset-test",
      image: "node:22",
    });
    await sandbox.start();
    await sandbox.reset();
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

  it("takes and lists snapshots", async () => {
    const provider = new MockProvider();
    const sandbox = await provider.create({
      name: "snap-test",
      image: "node:22",
    });
    await sandbox.start();

    const snap = await sandbox.snapshot("v1");
    expect(snap.tag).toBe("v1");
    expect(snap.id).toBeTruthy();

    const snaps = await provider.snapshots("snap-test");
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.tag).toBe("v1");
  });

  it("restores from snapshot", async () => {
    const provider = new MockProvider();
    const sandbox = await provider.create({
      name: "restore-test",
      image: "node:22",
    });
    await sandbox.start();
    await sandbox.snapshot("before-install");
    await sandbox.restore("before-install");
    expect(await sandbox.status()).toBe("stopped");
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
