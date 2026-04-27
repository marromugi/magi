import {
  readFile,
  writeFile,
  unlink,
  readdir,
  mkdir,
  access,
} from "fs/promises";
import { join, dirname, relative } from "path";
import type { StorageProvider } from "../types";

export class FilesystemStorageProvider implements StorageProvider {
  readonly name = "filesystem";

  constructor(private baseDir: string) {}

  private resolvePath(path: string): string {
    return join(this.baseDir, path);
  }

  async read(path: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolvePath(path));
    } catch {
      return null;
    }
  }

  async write(path: string, data: Buffer | string): Promise<void> {
    const fullPath = this.resolvePath(path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  async delete(path: string): Promise<void> {
    try {
      await unlink(this.resolvePath(path));
    } catch {
      // ignore missing
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(this.resolvePath(path));
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    const searchDir = prefix ? this.resolvePath(prefix) : this.baseDir;

    try {
      return await this.listRecursive(searchDir, prefix ?? "");
    } catch {
      return [];
    }
  }

  private async listRecursive(dir: string, prefix: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const results: string[] = [];

    for (const entry of entries) {
      const rel = prefix
        ? join(prefix, entry.name)
        : relative(this.baseDir, join(dir, entry.name));

      if (entry.isDirectory()) {
        const nested = await this.listRecursive(join(dir, entry.name), rel);
        results.push(...nested);
      } else {
        results.push(rel);
      }
    }

    return results;
  }
}
