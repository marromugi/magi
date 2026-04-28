import { Hono } from "hono";
import type { Env, Device } from "../types";

const sandbox = new Hono<{
  Bindings: Env;
  Variables: { device: Device };
}>();

sandbox.post("/exec", async (c) => {
  if (!c.env.sandbox) {
    return c.json({ error: "Sandbox not available" }, 503);
  }

  const body = await c.req.json<{
    command?: string;
    args?: string[];
  }>();

  if (!body.command) {
    return c.json({ error: "command is required" }, 400);
  }

  const result = await c.env.sandbox.exec(body.command, body.args);
  return c.json(result);
});

sandbox.get("/status", async (c) => {
  if (!c.env.sandbox) {
    return c.json({ error: "Sandbox not available" }, 503);
  }

  const status = await c.env.sandbox.status();
  return c.json({ status });
});

sandbox.post("/snapshot", async (c) => {
  if (!c.env.sandbox) {
    return c.json({ error: "Sandbox not available" }, 503);
  }

  const body = await c.req.json<{ tag?: string }>();
  const info = await c.env.sandbox.snapshot(body.tag);
  return c.json(info);
});

export { sandbox };
