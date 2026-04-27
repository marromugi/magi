import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../index";

const ADMIN_KEY = "test-admin-key";
const adminEnv = { ...env, ADMIN_API_KEY: ADMIN_KEY };
const authHeader = { Authorization: `Bearer ${ADMIN_KEY}` };

describe("POST /admin/devices/invite", () => {
  it("creates an invite and returns bootstrap token", async () => {
    const res = await app.request(
      "/admin/devices/invite",
      { method: "POST", headers: authHeader },
      adminEnv,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
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
    const body = await res.json();
    expect(body.devices).toEqual([]);
  });

  it("returns paired devices", async () => {
    // Create invite
    const inviteRes = await app.request(
      "/admin/devices/invite",
      { method: "POST", headers: authHeader },
      adminEnv,
    );
    const { bootstrapToken } = await inviteRes.json();

    // Pair device
    await app.request(
      "/pair",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapToken,
          deviceName: "my-device",
        }),
      },
      adminEnv,
    );

    // List devices
    const res = await app.request(
      "/admin/devices",
      { headers: authHeader },
      adminEnv,
    );
    const body = await res.json();
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0].name).toBe("my-device");
  });
});

describe("DELETE /admin/devices/:id", () => {
  it("revokes a device", async () => {
    // Create and pair
    const inviteRes = await app.request(
      "/admin/devices/invite",
      { method: "POST", headers: authHeader },
      adminEnv,
    );
    const { bootstrapToken } = await inviteRes.json();

    const pairRes = await app.request(
      "/pair",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapToken,
          deviceName: "to-revoke",
        }),
      },
      adminEnv,
    );
    const { deviceId } = await pairRes.json();

    // Revoke
    const res = await app.request(
      `/admin/devices/${deviceId}`,
      { method: "DELETE", headers: authHeader },
      adminEnv,
    );
    expect(res.status).toBe(200);

    // Verify revoked
    const listRes = await app.request(
      "/admin/devices",
      { headers: authHeader },
      adminEnv,
    );
    const body = await listRes.json();
    expect(body.devices).toHaveLength(0);
  });
});
