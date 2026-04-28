import type { Sandbox, SandboxProvider } from "../core/provider";
import type {
  SandboxConfig,
  ExecResult,
  SandboxStatus,
  SnapshotInfo,
} from "../core/types";

/**
 * Cloudflare Containers sandbox provider.
 *
 * Architecture:
 *   Worker (gateway) → Durable Object (sandbox state) → Container (exec)
 *
 * The Durable Object manages the container lifecycle:
 *   - Container is created on first request (or restored from snapshot)
 *   - exec() sends commands to the running container via internal API
 *   - Snapshot uses the Sandbox SDK's backup/restore mechanism
 *
 * Container image is specified in wrangler.jsonc:
 *   "containers": {
 *     "sandbox": { "image": "node:22-slim", "instance_type": "standard-1", "max_instances": 1 }
 *   }
 *
 * When deployed, replace this stub with Durable Object + Container integration.
 */

export interface CloudflareSandboxOptions {
  /** Durable Object stub for sandbox management (from env binding) */
  durableObject?: unknown;
  /** Container binding (from wrangler.jsonc containers config) */
  container?: unknown;
}

class CloudflareSandbox implements Sandbox {
  readonly id: string;
  private options: CloudflareSandboxOptions;

  constructor(id: string, options: CloudflareSandboxOptions) {
    this.id = id;
    this.options = options;
  }

  async start(): Promise<void> {
    // TODO: Signal Durable Object to start the container
    // await this.options.durableObject.start()
    throw new Error(
      "Cloudflare sandbox: deploy to Cloudflare Workers to use this provider",
    );
  }

  async stop(): Promise<void> {
    // TODO: Signal Durable Object to stop (sleep) the container
    throw new Error("Cloudflare sandbox not available outside Workers");
  }

  async reset(): Promise<void> {
    // TODO: Destroy and recreate container
    throw new Error("Cloudflare sandbox not available outside Workers");
  }

  async status(): Promise<SandboxStatus> {
    // TODO: Query Durable Object for container status
    return "stopped";
  }

  async exec(
    command: string,
    args?: string[],
    options?: { env?: Record<string, string> },
  ): Promise<ExecResult> {
    // TODO: Send exec request to container via Durable Object
    // The container exposes an internal HTTP API that the DO proxies
    void command;
    void args;
    void options;
    throw new Error("Cloudflare sandbox not available outside Workers");
  }

  async copyFrom(sandboxPath: string): Promise<Buffer> {
    // TODO: Read file from container via exec("cat", [path])
    void sandboxPath;
    throw new Error("Cloudflare sandbox not available outside Workers");
  }

  async copyTo(sandboxPath: string, data: Buffer): Promise<void> {
    // TODO: Write file to container via exec("sh", ["-c", "base64 -d > path"])
    void sandboxPath;
    void data;
    throw new Error("Cloudflare sandbox not available outside Workers");
  }

  async snapshot(tag?: string): Promise<SnapshotInfo> {
    // TODO: Use Sandbox SDK backup API to snapshot container state
    void tag;
    throw new Error("Cloudflare sandbox not available outside Workers");
  }

  async restore(tag: string): Promise<void> {
    // TODO: Use Sandbox SDK restore API
    void tag;
    throw new Error("Cloudflare sandbox not available outside Workers");
  }
}

export class CloudflareSandboxProvider implements SandboxProvider {
  readonly name = "cloudflare";
  private options: CloudflareSandboxOptions;

  constructor(options?: CloudflareSandboxOptions) {
    this.options = options ?? {};
  }

  async create(config: SandboxConfig): Promise<Sandbox> {
    return new CloudflareSandbox(config.name, this.options);
  }

  async get(id: string): Promise<Sandbox | null> {
    // TODO: Check if container exists via Durable Object
    void id;
    return null;
  }

  async list(): Promise<Sandbox[]> {
    return [];
  }

  async snapshots(): Promise<SnapshotInfo[]> {
    // TODO: List snapshots from R2 or Durable Object storage
    return [];
  }
}
