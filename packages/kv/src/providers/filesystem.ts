import { readFile, writeFile, unlink, readdir, mkdir } from "fs/promises";
import { join } from "path";
import type { KVProvider } from "../types";

interface StoredEntry {
  value: string;
  expiresAt?: number;
}

function encodeKey(key: string): string {
  return encodeURIComponent(key);
}

function decodeKey(filename: string): string {
  return decodeURIComponent(filename);
}

export class FilesystemStorage implements KVProvider {
  readonly name = "filesystem";
  private dir: string;
  private initialized = false;

  constructor(dir: string) {
    this.dir = dir;
  }

  private async ensureDir() {
    if (!this.initialized) {
      await mkdir(this.dir, { recursive: true });
      this.initialized = true;
    }
  }

  private filePath(key: string): string {
    return join(this.dir, encodeKey(key));
  }

  async get(key: string): Promise<string | null> {
    await this.ensureDir();
    try {
      const raw = await readFile(this.filePath(key), "utf-8");
      const entry = JSON.parse(raw) as StoredEntry;
      if (entry.expiresAt && Date.now() >= entry.expiresAt) {
        await this.delete(key);
        return null;
      }
      return entry.value;
    } catch {
      return null;
    }
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void> {
    await this.ensureDir();
    const entry: StoredEntry = { value };
    if (options?.expirationTtl) {
      entry.expiresAt = Date.now() + options.expirationTtl * 1000;
    }
    await writeFile(this.filePath(key), JSON.stringify(entry));
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.filePath(key));
    } catch {
      // ignore missing
    }
  }

  async list(prefix?: string): Promise<string[]> {
    await this.ensureDir();
    const files = await readdir(this.dir);
    const keys = files.map(decodeKey);
    if (!prefix) return keys;
    return keys.filter((k) => k.startsWith(prefix));
  }
}
