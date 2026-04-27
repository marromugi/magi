import type { Sandbox, SandboxProvider } from "../core/provider";
import type { SandboxConfig, ExecResult, SandboxStatus } from "../core/types";

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
    // TODO: integrate microsandbox
    this._status = "running";
  }

  async stop(): Promise<void> {
    this._status = "stopped";
  }

  async status(): Promise<SandboxStatus> {
    return this._status;
  }

  async exec(command: string, args?: string[]): Promise<ExecResult> {
    // TODO: integrate microsandbox
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Local sandbox not yet implemented: ${command} ${(args ?? []).join(" ")}`,
    };
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
}
