import { createMiddleware } from "hono/factory";
import type { Device } from "./types";
import { DeviceStore } from "./device";
import type { KVProvider } from "@magi/kv";

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

interface AdminAuthEnv {
  ADMIN_API_KEY: string;
}

export function adminAuth() {
  return createMiddleware<{ Bindings: AdminAuthEnv }>(async (c, next) => {
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token || token !== c.env.ADMIN_API_KEY) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });
}

interface DeviceAuthEnv {
  deviceStorage: KVProvider;
}

export function deviceAuth() {
  return createMiddleware<{
    Bindings: DeviceAuthEnv;
    Variables: { device: Device };
  }>(async (c, next) => {
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const store = new DeviceStore(c.env.deviceStorage);
    const device = await store.validateDeviceToken(token);
    if (!device) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("device", device);
    await next();
  });
}
