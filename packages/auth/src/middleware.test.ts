import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { Hono } from "hono";
import { FilesystemStorage } from "@magi/kv/providers/filesystem";
import { adminAuth, deviceAuth } from "./middleware";
import { DeviceStore } from "./device";
import type { KVProvider } from "@magi/kv";

interface TestEnv {
  ADMIN_API_KEY: string;
  deviceStorage: KVProvider;
}

function createApp() {
  const app = new Hono<{ Bindings: TestEnv }>();

  app.get("/admin/test", adminAuth(), (c) => c.json({ ok: true }));

  app.get("/api/test", deviceAuth(), (c) => {
    const device = c.get("device");
    return c.json({ deviceId: device.id });
  });

  return app;
}

describe("adminAuth middleware", () => {
  let tempDir: string;
  let env: TestEnv;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "magi-mw-"));
    env = {
      ADMIN_API_KEY: "test-admin-key",
      deviceStorage: new FilesystemStorage(tempDir),
    };
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("allows request with valid admin API key", async () => {
    const app = createApp();
    const res = await app.request(
      "/admin/test",
      { headers: { Authorization: "Bearer test-admin-key" } },
      env,
    );
    expect(res.status).toBe(200);
  });

  it("rejects request without Authorization header", async () => {
    const app = createApp();
    const res = await app.request("/admin/test", {}, env);
    expect(res.status).toBe(401);
  });

  it("rejects request with wrong API key", async () => {
    const app = createApp();
    const res = await app.request(
      "/admin/test",
      { headers: { Authorization: "Bearer wrong-key" } },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("deviceAuth middleware", () => {
  let tempDir: string;
  let env: TestEnv;
  let deviceToken: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "magi-mw-"));
    const storage = new FilesystemStorage(tempDir);
    env = { ADMIN_API_KEY: "test-admin-key", deviceStorage: storage };

    const store = new DeviceStore(storage);
    const invite = await store.createInvite({ ttlMs: 60_000 });
    const result = await store.pair({
      bootstrapToken: invite.bootstrapToken,
      deviceName: "test-device",
    });
    deviceToken = result.deviceToken;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("allows request with valid device token", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/test",
      { headers: { Authorization: `Bearer ${deviceToken}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deviceId: string };
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
