import { Hono } from "hono";
import type { Env } from "../types";
import { DeviceStore } from "@magi/auth";

const pair = new Hono<{ Bindings: Env }>();

pair.post("/", async (c) => {
  const body = await c.req.json<{
    bootstrapToken?: string;
    deviceName?: string;
  }>();

  if (!body.bootstrapToken || !body.deviceName) {
    return c.json({ error: "bootstrapToken and deviceName are required" }, 400);
  }

  const store = new DeviceStore({
    kv: c.env.kv,
    devices: c.env.deviceRepository,
  });
  try {
    const result = await store.pair({
      bootstrapToken: body.bootstrapToken,
      deviceName: body.deviceName,
    });
    return c.json(result);
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "Pairing failed" },
      401,
    );
  }
});

export { pair };
