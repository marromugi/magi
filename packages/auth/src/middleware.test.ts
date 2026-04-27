import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { Hono } from "hono";
import { adminAuth, deviceAuth } from "./middleware";
import { DeviceStore } from "./device";
import type { AuthEnv } from "./types";

function createApp() {
  const app = new Hono<{ Bindings: AuthEnv }>();

  app.get("/admin/test", adminAuth(), (c) => c.json({ ok: true }));

  app.get("/api/test", deviceAuth(), (c) => {
    const device = c.get("device");
    return c.json({ deviceId: device.id });
  });

  return app;
}

describe("adminAuth middleware", () => {
  it("allows request with valid admin API key", async () => {
    const app = createApp();
    const res = await app.request(
      "/admin/test",
      { headers: { Authorization: "Bearer test-admin-key" } },
      { ...env, ADMIN_API_KEY: "test-admin-key" },
    );
    expect(res.status).toBe(200);
  });

  it("rejects request without Authorization header", async () => {
    const app = createApp();
    const res = await app.request(
      "/admin/test",
      {},
      { ...env, ADMIN_API_KEY: "test-admin-key" },
    );
    expect(res.status).toBe(401);
  });

  it("rejects request with wrong API key", async () => {
    const app = createApp();
    const res = await app.request(
      "/admin/test",
      { headers: { Authorization: "Bearer wrong-key" } },
      { ...env, ADMIN_API_KEY: "test-admin-key" },
    );
    expect(res.status).toBe(401);
  });
});

describe("deviceAuth middleware", () => {
  let store: DeviceStore;
  let deviceToken: string;

  beforeEach(async () => {
    store = new DeviceStore(env.DEVICES);
    const invite = await store.createInvite({ ttlMs: 60_000 });
    const result = await store.pair({
      bootstrapToken: invite.bootstrapToken,
      deviceName: "test-device",
    });
    deviceToken = result.deviceToken;
  });

  it("allows request with valid device token", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/test",
      { headers: { Authorization: `Bearer ${deviceToken}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deviceId).toBeTruthy();
  });

  it("rejects request without token", async () => {
    const app = createApp();
    const res = await app.request("/api/test", {}, env);
    expect(res.status).toBe(401);
  });

  it("rejects request with invalid token", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/test",
      { headers: { Authorization: "Bearer invalid-token" } },
      env,
    );
    expect(res.status).toBe(401);
  });
});
