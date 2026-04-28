import type { StorageProvider } from "../types";

/**
 * Cloudflare R2 storage provider.
 * Wraps an R2Bucket binding from Cloudflare Workers.
 *
 * Usage in wrangler.jsonc:
 *   "r2_buckets": [{ "binding": "MAGI_STORAGE", "bucket_name": "magi-storage" }]
 *
 * Then: new R2StorageProvider(env.MAGI_STORAGE)
 */

// R2 type (minimal subset used)
interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: ArrayBuffer | string): Promise<unknown>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<R2Object | null>;
  list(options?: { prefix?: string; cursor?: string }): Promise<R2ListResult>;
}

interface R2Object {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2ListResult {
  objects: Array<{ key: string }>;
  truncated: boolean;
  cursor?: string;
}

export class R2StorageProvider implements StorageProvider {
  readonly name = "r2";

  constructor(private bucket: R2Bucket) {}

  async read(path: string): Promise<Buffer | null> {
    const obj = await this.bucket.get(path);
    if (!obj) return null;
    const ab = await obj.arrayBuffer();
    return Buffer.from(ab);
  }

  async write(path: string, data: Buffer | string): Promise<void> {
    await this.bucket.put(path, data);
  }

  async delete(path: string): Promise<void> {
    await this.bucket.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    const head = await this.bucket.head(path);
    return head !== null;
  }

  async list(prefix?: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.bucket.list({ prefix, cursor });
      keys.push(...result.objects.map((o) => o.key));
      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);

    return keys;
  }
}
