import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import app from "../index";

const ADMIN_KEY = "test-admin-key";
const adminEnv = { ...env, ADMIN_API_KEY: ADMIN_KEY };
const authHeader = { Authorization: `Bearer ${ADMIN_KEY}` };

describe("POST /pair", () => {
  it("exchanges bootstrap token for device token", async () => {
    const inviteRes = await app.request(
      "/admin/devices/invite",
      { method: "POST", headers: authHeader },
      adminEnv,
    );
    const { bootstrapToken } = await inviteRes.json();

    const res = await app.request(
      "/pair",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapToken,
          deviceName: "new-device",
        }),
      },
      adminEnv,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
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
      adminEnv,
    );

    expect(res.status).toBe(401);
    const body = await res.json();
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
      adminEnv,
    );

    expect(res.status).toBe(400);
  });

  it("paired device can access authenticated endpoints", async () => {
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
          deviceName: "auth-test",
        }),
      },
      adminEnv,
    );
    const { deviceToken } = await pairRes.json();

    // Use device token to access protected endpoint
    const res = await app.request(
      "/api/me",
      { headers: { Authorization: `Bearer ${deviceToken}` } },
      adminEnv,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.device.name).toBe("auth-test");
  });
});
