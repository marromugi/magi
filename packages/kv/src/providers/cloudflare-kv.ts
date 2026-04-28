import type { KVProvider } from "../types";

/**
 * Cloudflare Workers KV provider.
 * Wraps a KVNamespace binding from Cloudflare Workers.
 *
 * Usage in wrangler.jsonc:
 *   "kv_namespaces": [{ "binding": "MAGI_KV", "id": "..." }]
 *
 * Then: new CloudflareKVProvider(env.MAGI_KV)
 */
export class CloudflareKVProvider implements KVProvider {
  readonly name = "cloudflare-kv";

  constructor(private kv: KVNamespace) {}

  async get(key: string): Promise<string | null> {
    return this.kv.get(key);
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void> {
    await this.kv.put(key, value, {
      expirationTtl: options?.expirationTtl,
    });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const result = await this.kv.list({ prefix });
    return result.keys.map((k) => k.name);
  }
}
