import { createMiddleware } from "hono/factory";
import type { Device, AuthEnv } from "./types";
import { DeviceStore } from "./device";

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export function adminAuth() {
  return createMiddleware<{ Bindings: AuthEnv }>(async (c, next) => {
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token || token !== c.env.ADMIN_API_KEY) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });
}

export function deviceAuth() {
  return createMiddleware<{
    Bindings: AuthEnv;
    Variables: { device: Device };
  }>(async (c, next) => {
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const store = new DeviceStore(c.env.DEVICES);
    const device = await store.validateDeviceToken(token);
    if (!device) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("device", device);
    await next();
  });
}
