import type { Sandbox, SandboxProvider } from "../core/provider";
import type {
  SandboxConfig,
  ExecResult,
  SandboxStatus,
  SnapshotInfo,
} from "../core/types";

async function dockerExec(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

export interface DockerProviderOptions {
  prefix?: string;
}

class DockerSandbox implements Sandbox {
  readonly id: string;
  private containerName: string;
  private config: SandboxConfig;
  private prefix: string;

  constructor(
    id: string,
    containerName: string,
    config: SandboxConfig,
    prefix: string,
  ) {
    this.id = id;
    this.containerName = containerName;
    this.config = config;
    this.prefix = prefix;
  }

  async start(): Promise<void> {
    const status = await this.status();
    if (status === "running") return;

    // Check if container exists
    const inspect = await dockerExec([
      "container",
      "inspect",
      this.containerName,
    ]);

    if (inspect.exitCode !== 0) {
      // Container doesn't exist, create it
      const args = ["create", "--name", this.containerName];

      if (this.config.cpus) {
        args.push("--cpus", String(this.config.cpus));
      }
      if (this.config.memoryMib) {
        args.push("--memory", `${this.config.memoryMib}m`);
      }
      if (this.config.env) {
        for (const [key, value] of Object.entries(this.config.env)) {
          args.push("-e", `${key}=${value}`);
        }
      }

      // Keep container alive with tail -f /dev/null
      args.push(this.config.image, "tail", "-f", "/dev/null");

      const create = await dockerExec(args);
      if (create.exitCode !== 0) {
        throw new Error(`Failed to create container: ${create.stderr}`);
      }
    }

    const start = await dockerExec(["start", this.containerName]);
    if (start.exitCode !== 0) {
      throw new Error(`Failed to start container: ${start.stderr}`);
    }
  }

  async stop(): Promise<void> {
    await dockerExec(["stop", "-t", "1", this.containerName]);
  }

  async reset(): Promise<void> {
    await dockerExec(["rm", "-f", this.containerName]);
  }

  async status(): Promise<SandboxStatus> {
    const result = await dockerExec([
      "container",
      "inspect",
      "-f",
      "{{.State.Status}}",
      this.containerName,
    ]);

    if (result.exitCode !== 0) return "stopped";

    const state = result.stdout.trim();
    if (state === "running") return "running";
    return "stopped";
  }

  async exec(command: string, args?: string[]): Promise<ExecResult> {
    const execArgs = ["exec", this.containerName, command, ...(args ?? [])];
    return dockerExec(execArgs);
  }

  async snapshot(tag?: string): Promise<SnapshotInfo> {
    const snapshotTag = tag ?? `snap-${Date.now()}`;
    const imageName = `${this.prefix}-snapshot-${this.id}:${snapshotTag}`;

    const result = await dockerExec(["commit", this.containerName, imageName]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to snapshot: ${result.stderr}`);
    }

    return {
      id: result.stdout.trim().slice(0, 12),
      tag: snapshotTag,
      createdAt: new Date().toISOString(),
    };
  }

  async restore(tag: string): Promise<void> {
    const imageName = `${this.prefix}-snapshot-${this.id}:${tag}`;

    // Stop and remove current container
    await dockerExec(["rm", "-f", this.containerName]);

    // Create new container from snapshot image
    const args = ["create", "--name", this.containerName];

    if (this.config.env) {
      for (const [key, value] of Object.entries(this.config.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    args.push(imageName, "tail", "-f", "/dev/null");

    const create = await dockerExec(args);
    if (create.exitCode !== 0) {
      throw new Error(`Failed to restore from snapshot: ${create.stderr}`);
    }
  }
}

export class DockerSandboxProvider implements SandboxProvider {
  readonly name = "docker";
  private prefix: string;
  private sandboxes = new Map<string, DockerSandbox>();

  constructor(options?: DockerProviderOptions) {
    this.prefix = options?.prefix ?? "magi";
  }

  private containerName(id: string): string {
    return `${this.prefix}-${id}`;
  }

  async create(config: SandboxConfig): Promise<Sandbox> {
    const sandbox = new DockerSandbox(
      config.name,
      this.containerName(config.name),
      config,
      this.prefix,
    );
    this.sandboxes.set(config.name, sandbox);
    return sandbox;
  }

  async get(id: string): Promise<Sandbox | null> {
    // Check in-memory first
    if (this.sandboxes.has(id)) {
      return this.sandboxes.get(id)!;
    }

    // Check if container exists in Docker
    const result = await dockerExec([
      "container",
      "inspect",
      "-f",
      "{{.Config.Image}}",
      this.containerName(id),
    ]);

    if (result.exitCode !== 0) return null;

    const image = result.stdout.trim();
    const sandbox = new DockerSandbox(
      id,
      this.containerName(id),
      { name: id, image },
      this.prefix,
    );
    this.sandboxes.set(id, sandbox);
    return sandbox;
  }

  async list(): Promise<Sandbox[]> {
    const result = await dockerExec([
      "ps",
      "-a",
      "--filter",
      `name=${this.prefix}-`,
      "--format",
      "{{.Names}}",
    ]);

    if (result.exitCode !== 0 || !result.stdout.trim()) return [];

    const names = result.stdout.trim().split("\n");
    const sandboxes: Sandbox[] = [];

    for (const name of names) {
      const id = name.replace(`${this.prefix}-`, "");
      // Skip snapshot containers
      if (id.startsWith("snapshot-")) continue;
      const sandbox = await this.get(id);
      if (sandbox) sandboxes.push(sandbox);
    }

    return sandboxes;
  }

  async snapshots(sandboxId: string): Promise<SnapshotInfo[]> {
    const result = await dockerExec([
      "images",
      "--filter",
      `reference=${this.prefix}-snapshot-${sandboxId}`,
      "--format",
      "{{.ID}}\t{{.Tag}}\t{{.CreatedAt}}",
    ]);

    if (result.exitCode !== 0 || !result.stdout.trim()) return [];

    return result.stdout
      .trim()
      .split("\n")
      .map((line) => {
        const [id, tag, createdAt] = line.split("\t");
        return { id: id!, tag: tag!, createdAt: createdAt! };
      });
  }
}
