import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { FilesystemStorage } from "@magi/kv/providers/filesystem";
import { SQLiteDatabase } from "@magi/db/providers/sqlite";
import app from "../index";
import type { Env } from "../types";

const ADMIN_KEY = "test-admin-key";
const authHeader = { Authorization: `Bearer ${ADMIN_KEY}` };
let tempDir: string;
let db: SQLiteDatabase;
let env: Env;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "magi-gw-"));
  db = new SQLiteDatabase(join(tempDir, "test.db"));
  env = {
    ADMIN_API_KEY: ADMIN_KEY,
    kv: new FilesystemStorage(join(tempDir, "kv")),
    deviceRepository: db.devices,
    sessionRepository: db.sessions,
    stepRepository: db.steps,
    sandbox: null,
  };
});

afterEach(async () => {
  db.close();
  await rm(tempDir, { recursive: true });
});

describe("POST /pair", () => {
  it("exchanges bootstrap token for device token", async () => {
    const inviteRes = await app.request(
      "/admin/devices/invite",
      { method: "POST", headers: authHeader },
      env,
    );
    const { bootstrapToken } = (await inviteRes.json()) as {
      bootstrapToken: string;
    };

    const res = await app.request(
      "/pair",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapToken, deviceName: "new-device" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      deviceToken: string;
      deviceId: string;
    };
    expect(body.deviceToken).toMatch(/^[0-9a-f]{64}$/);
    expect(body.deviceId).toBeTruthy();
  });

  it("rejects invalid bootstrap token", async () => {
    const res = await app.request(
      "/pair",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapToken: "invalid",
          deviceName: "device",
        }),
      },
      env,
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it("rejects missing fields", async () => {
    const res = await app.request(
      "/pair",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
    );

    expect(res.status).toBe(400);
  });

  it("paired device can access authenticated endpoints", async () => {
    const inviteRes = await app.request(
      "/admin/devices/invite",
      { method: "POST", headers: authHeader },
      env,
    );
    const { bootstrapToken } = (await inviteRes.json()) as {
      bootstrapToken: string;
    };

    const pairRes = await app.request(
      "/pair",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapToken, deviceName: "auth-test" }),
      },
      env,
    );
    const { deviceToken } = (await pairRes.json()) as { deviceToken: string };

    const res = await app.request(
      "/api/me",
      { headers: { Authorization: `Bearer ${deviceToken}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { device: { name: string } };
    expect(body.device.name).toBe("auth-test");
  });
});
