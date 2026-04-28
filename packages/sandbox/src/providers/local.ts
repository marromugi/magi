import type { Sandbox, SandboxProvider } from "../core/provider";
import type {
  SandboxConfig,
  ExecResult,
  SandboxStatus,
  SnapshotInfo,
} from "../core/types";

class LocalSandbox implements Sandbox {
  readonly id: string;
  private _status: SandboxStatus = "stopped";

  constructor(
    id: string,
    private config: SandboxConfig,
  ) {
    this.id = id;
  }

  async start(): Promise<void> {
    this._status = "running";
  }

  async stop(): Promise<void> {
    this._status = "stopped";
  }

  async reset(): Promise<void> {
    this._status = "stopped";
  }

  async status(): Promise<SandboxStatus> {
    return this._status;
  }

  async exec(command: string, args?: string[]): Promise<ExecResult> {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Local sandbox not yet implemented: ${command} ${(args ?? []).join(" ")}`,
    };
  }

  async copyFrom(): Promise<Buffer> {
    throw new Error("Local sandbox not yet implemented");
  }

  async copyTo(): Promise<void> {
    throw new Error("Local sandbox not yet implemented");
  }

  async snapshot(tag?: string): Promise<SnapshotInfo> {
    return {
      id: `local-${this.id}-${Date.now()}`,
      tag: tag ?? "latest",
      createdAt: new Date().toISOString(),
    };
  }

  async restore(): Promise<void> {
    // placeholder
  }
}

export class LocalSandboxProvider implements SandboxProvider {
  readonly name = "local";
  private sandboxes = new Map<string, LocalSandbox>();

  async create(config: SandboxConfig): Promise<Sandbox> {
    const sandbox = new LocalSandbox(config.name, config);
    this.sandboxes.set(config.name, sandbox);
    return sandbox;
  }

  async get(id: string): Promise<Sandbox | null> {
    return this.sandboxes.get(id) ?? null;
  }

  async list(): Promise<Sandbox[]> {
    return [...this.sandboxes.values()];
  }

  async snapshots(): Promise<SnapshotInfo[]> {
    return [];
  }
}
