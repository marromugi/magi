import { CloudflareKVProvider } from "@magi/kv/providers/cloudflare-kv";
import { D1DatabaseProvider } from "@magi/db/providers/cloudflare-d1";
import { R2StorageProvider } from "@magi/storage/providers/cloudflare-r2";
import { CloudflareSandboxProvider } from "@magi/sandbox/providers/cloudflare";
import type { Runtime } from "../types";

/**
 * Cloudflare Workers environment bindings.
 * These correspond to wrangler.jsonc bindings.
 *
 * Full types come from @cloudflare/workers-types at deploy time.
 * Here we use the constructor parameter types from each provider.
 */
export interface CloudflareEnv {
  MAGI_KV: ConstructorParameters<typeof CloudflareKVProvider>[0];
  MAGI_DB: ConstructorParameters<typeof D1DatabaseProvider>[0];
  MAGI_STORAGE: ConstructorParameters<typeof R2StorageProvider>[0];
}

export function createCloudflareRuntime(env: CloudflareEnv): Runtime {
  return {
    name: "cloudflare",
    kv: new CloudflareKVProvider(env.MAGI_KV),
    db: new D1DatabaseProvider(env.MAGI_DB),
    storage: new R2StorageProvider(env.MAGI_STORAGE),
    sandbox: new CloudflareSandboxProvider(),
  };
}
