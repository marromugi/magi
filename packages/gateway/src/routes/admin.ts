import { Hono } from "hono";
import type { Env } from "../types";
import { adminAuth, DeviceStore } from "@magi/auth";

const BOOTSTRAP_TTL_MS = 10 * 60 * 1000; // 10 minutes

const admin = new Hono<{ Bindings: Env }>();

admin.use("/*", adminAuth());

admin.post("/devices/invite", async (c) => {
  const store = new DeviceStore(c.env.deviceStorage);
  const result = await store.createInvite({ ttlMs: BOOTSTRAP_TTL_MS });
  return c.json(result);
});

admin.get("/devices", async (c) => {
  const store = new DeviceStore(c.env.deviceStorage);
  const devices = await store.listDevices();
  return c.json({ devices });
});

admin.delete("/devices/:id", async (c) => {
  const store = new DeviceStore(c.env.deviceStorage);
  await store.revokeDevice(c.req.param("id"));
  return c.json({ ok: true });
});

export { admin };
