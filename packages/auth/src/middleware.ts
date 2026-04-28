import { createMiddleware } from "hono/factory";
import type { Device } from "./types";
import type { DeviceRepository } from "@magi/db";
import { hashToken } from "./token";

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
  deviceRepository: DeviceRepository;
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

    const tokenHash = await hashToken(token);
    const device = await c.env.deviceRepository.findByTokenHash(tokenHash);
    if (!device || device.status !== "paired") {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("device", device);
    await next();
  });
}
