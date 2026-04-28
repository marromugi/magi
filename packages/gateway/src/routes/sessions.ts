import { Hono } from "hono";
import type { Env, Device } from "../types";

const sessions = new Hono<{
  Bindings: Env;
  Variables: { device: Device };
}>();

sessions.get("/", async (c) => {
  const all = await c.env.sessionRepository.list();
  return c.json({ sessions: all });
});

sessions.get("/:id", async (c) => {
  const session = await c.env.sessionRepository.findById(c.req.param("id"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  return c.json({ session });
});

sessions.get("/:id/steps", async (c) => {
  const session = await c.env.sessionRepository.findById(c.req.param("id"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const steps = await c.env.stepRepository.listBySessionId(c.req.param("id"));
  return c.json({ steps });
});

export { sessions };
