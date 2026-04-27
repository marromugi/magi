import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { FilesystemStorage } from "@magi/kv/providers/filesystem";
import app from "../index";
import type { Env } from "../types";

const ADMIN_KEY = "test-admin-key";
const authHeader = { Authorization: `Bearer ${ADMIN_KEY}` };
let tempDir: string;
let adminEnv: Env;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "magi-gw-"));
  adminEnv = {
    ADMIN_API_KEY: ADMIN_KEY,
    deviceStorage: new FilesystemStorage(tempDir),
  };
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

describe("POST /admin/devices/invite", () => {
  it("creates an invite and returns bootstrap token", async () => {
    const res = await app.request(
      "/admin/devices/invite",
      { method: "POST", headers: authHeader },
      adminEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      bootstrapToken: string;
      pairingId: string;
    };
    expect(body.bootstrapToken).toMatch(/^[0-9a-f]{64}$/);
    expect(body.pairingId).toBeTruthy();
  });

  it("rejects without admin auth", async () => {
    const res = await app.request(
      "/admin/devices/invite",
      { method: "POST" },
      adminEnv,
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /admin/devices", () => {
  it("returns empty list initially", async () => {
    const res = await app.request(
      "/admin/devices",
      { headers: authHeader },
      adminEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { devices: unknown[] };
    expect(body.devices).toEqual([]);
  });

  it("returns paired devices", async () => {
    const inviteRes = await app.request(
      "/admin/devices/invite",
      { method: "POST", headers: authHeader },
      adminEnv,
    );
    const { bootstrapToken } = (await inviteRes.json()) as {
      bootstrapToken: string;
    };

    await app.request(
      "/pair",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapToken, deviceName: "my-device" }),
      },
      adminEnv,
    );

    const res = await app.request(
      "/admin/devices",
      { headers: authHeader },
      adminEnv,
    );
    const body = (await res.json()) as {
      devices: Array<{ name: string }>;
    };
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0]!.name).toBe("my-device");
  });
});

describe("DELETE /admin/devices/:id", () => {
  it("revokes a device", async () => {
    const inviteRes = await app.request(
      "/admin/devices/invite",
      { method: "POST", headers: authHeader },
      adminEnv,
    );
    const { bootstrapToken } = (await inviteRes.json()) as {
      bootstrapToken: string;
    };

    const pairRes = await app.request(
      "/pair",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bootstrapToken, deviceName: "to-revoke" }),
      },
      adminEnv,
    );
    const { deviceId } = (await pairRes.json()) as { deviceId: string };

    const res = await app.request(
      `/admin/devices/${deviceId}`,
      { method: "DELETE", headers: authHeader },
      adminEnv,
    );
    expect(res.status).toBe(200);

    const listRes = await app.request(
      "/admin/devices",
      { headers: authHeader },
      adminEnv,
    );
    const body = (await listRes.json()) as { devices: unknown[] };
    expect(body.devices).toHaveLength(0);
  });
});
