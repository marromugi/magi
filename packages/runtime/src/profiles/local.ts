import { join } from "path";
import { homedir } from "os";
import { FilesystemStorage } from "@magi/kv/providers/filesystem";
import { SQLiteDatabase } from "@magi/db/providers/sqlite";
import { FilesystemStorageProvider } from "@magi/storage/providers/filesystem";
import { LocalSandboxProvider } from "@magi/sandbox/providers/local";
import type { Runtime, RuntimeConfig } from "../types";

function defaultDataDir(): string {
  return join(homedir(), ".magi", "data");
}

export function createLocalRuntime(config?: RuntimeConfig): Runtime {
  const dataDir = config?.dataDir ?? defaultDataDir();

  return {
    name: "local",
    kv: new FilesystemStorage(join(dataDir, "kv")),
    db: new SQLiteDatabase(join(dataDir, "magi.db")),
    storage: new FilesystemStorageProvider(join(dataDir, "files")),
    sandbox: new LocalSandboxProvider(),
  };
}
