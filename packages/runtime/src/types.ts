import type { KVProvider } from "@magi/kv";
import type { DatabaseProvider } from "@magi/db";
import type { StorageProvider } from "@magi/storage";
import type { SandboxProvider } from "@magi/sandbox";

export interface Runtime {
  readonly name: string;
  kv: KVProvider;
  db: DatabaseProvider;
  storage: StorageProvider;
  sandbox: SandboxProvider;
}

export interface RuntimeConfig {
  dataDir?: string;
}
