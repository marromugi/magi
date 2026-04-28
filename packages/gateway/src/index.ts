import { Hono } from "hono";
import type { Device, Env } from "./types";
import { admin } from "./routes/admin";
import { pair } from "./routes/pair";
import { sandbox } from "./routes/sandbox";
import { deviceAuth } from "@magi/auth";

const app = new Hono<{ Bindings: Env }>();

// Public routes
app.get("/health", (c) => c.json({ ok: true }));
app.route("/pair", pair);

// Admin routes (CLI)
app.route("/admin", admin);

// Device-authenticated routes
const api = new Hono<{ Bindings: Env; Variables: { device: Device } }>();
api.use("/*", deviceAuth());
api.get("/me", (c) => {
  const device = c.get("device");
  return c.json({ device: { id: device.id, name: device.name } });
});
api.route("/sandbox", sandbox);
app.route("/api", api);

export default app;
