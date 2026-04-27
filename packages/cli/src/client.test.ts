import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { AdminClient } from "./client";

let server: ReturnType<typeof Bun.serve>;
let client: AdminClient;

const ADMIN_KEY = "test-key";

beforeEach(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const auth = req.headers.get("Authorization");
      if (auth !== `Bearer ${ADMIN_KEY}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      if (req.method === "POST" && url.pathname === "/admin/devices/invite") {
        return Response.json({
          bootstrapToken: "abc123",
          pairingId: "pair-1",
        });
      }
      if (req.method === "GET" && url.pathname === "/admin/devices") {
        return Response.json({
          devices: [{ id: "d1", name: "device-1", status: "paired" }],
        });
      }
      if (req.method === "DELETE" && url.pathname === "/admin/devices/d1") {
        return Response.json({ ok: true });
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    },
  });

  client = new AdminClient({
    workerUrl: `http://localhost:${server.port}`,
    adminApiKey: ADMIN_KEY,
  });
});

afterEach(() => {
  server.stop(true);
});

describe("AdminClient", () => {
  it("creates an invite", async () => {
    const result = await client.createInvite();
    expect(result.bootstrapToken).toBe("abc123");
    expect(result.pairingId).toBe("pair-1");
  });

  it("lists devices", async () => {
    const result = await client.listDevices();
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0]!.name).toBe("device-1");
  });

  it("revokes a device", async () => {
    const result = await client.revokeDevice("d1");
    expect(result.ok).toBe(true);
  });

  it("throws on auth failure", async () => {
    const badClient = new AdminClient({
      workerUrl: `http://localhost:${server.port}`,
      adminApiKey: "wrong",
    });
    expect(badClient.createInvite()).rejects.toThrow("Unauthorized");
  });
});
