import type { SandboxConfig, ExecResult, SandboxStatus } from "./types";

export interface Sandbox {
  readonly id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<SandboxStatus>;
  exec(command: string, args?: string[]): Promise<ExecResult>;
}

export interface SandboxProvider {
  readonly name: string;
  create(config: SandboxConfig): Promise<Sandbox>;
  get(id: string): Promise<Sandbox | null>;
  list(): Promise<Sandbox[]>;
}
