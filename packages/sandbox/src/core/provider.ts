import type {
  SandboxConfig,
  ExecResult,
  SandboxStatus,
  SnapshotInfo,
} from "./types";

export interface Sandbox {
  readonly id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): Promise<void>;
  status(): Promise<SandboxStatus>;
  exec(command: string, args?: string[]): Promise<ExecResult>;
  snapshot(tag?: string): Promise<SnapshotInfo>;
  restore(tag: string): Promise<void>;
}

export interface SandboxProvider {
  readonly name: string;
  create(config: SandboxConfig): Promise<Sandbox>;
  get(id: string): Promise<Sandbox | null>;
  list(): Promise<Sandbox[]>;
  snapshots(sandboxId: string): Promise<SnapshotInfo[]>;
}
