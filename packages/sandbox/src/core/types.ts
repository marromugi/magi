export interface SandboxConfig {
  name: string;
  image: string;
  cpus?: number;
  memoryMib?: number;
  env?: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type SandboxStatus = "creating" | "running" | "stopped";
