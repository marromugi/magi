import type { Sandbox, SandboxProvider } from "../core/provider";
import type {
  SandboxConfig,
  ExecResult,
  SandboxStatus,
  SnapshotInfo,
} from "../core/types";

/**
 * Cloudflare Containers sandbox provider (stub).
 *
 * Cloudflare Containers run Docker images on Cloudflare's infrastructure.
 * This provider will integrate with the Containers API when deployed.
 *
 * For now, this is a placeholder that documents the intended interface.
 */
class CloudflareSandbox implements Sandbox {
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  async start(): Promise<void> {
    throw new Error("Cloudflare sandbox not yet implemented");
  }

  async stop(): Promise<void> {
    throw new Error("Cloudflare sandbox not yet implemented");
  }

  async reset(): Promise<void> {
    throw new Error("Cloudflare sandbox not yet implemented");
  }

  async status(): Promise<SandboxStatus> {
    return "stopped";
  }

  async exec(): Promise<ExecResult> {
    throw new Error("Cloudflare sandbox not yet implemented");
  }

  async copyFrom(): Promise<Buffer> {
    throw new Error("Cloudflare sandbox not yet implemented");
  }

  async copyTo(): Promise<void> {
    throw new Error("Cloudflare sandbox not yet implemented");
  }

  async snapshot(): Promise<SnapshotInfo> {
    throw new Error("Cloudflare sandbox not yet implemented");
  }

  async restore(): Promise<void> {
    throw new Error("Cloudflare sandbox not yet implemented");
  }
}

export class CloudflareSandboxProvider implements SandboxProvider {
  readonly name = "cloudflare";

  async create(config: SandboxConfig): Promise<Sandbox> {
    return new CloudflareSandbox(config.name);
  }

  async get(): Promise<Sandbox | null> {
    return null;
  }

  async list(): Promise<Sandbox[]> {
    return [];
  }

  async snapshots(): Promise<SnapshotInfo[]> {
    return [];
  }
}
