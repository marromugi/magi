import { Command } from "commander";
import { readConfig, defaultConfigPath } from "../config";
import { createLocalRuntime } from "@magi/runtime";
import type { Runtime } from "@magi/runtime";
import app from "@magi/gateway";
import type { UI } from "../ui";

export function serveCommand(ui: UI): Command {
  return new Command("serve")
    .description("Start the MAGI gateway server")
    .option("--port <port>", "Port to listen on", "3000")
    .option("--image <image>", "Docker image for sandbox", "node:22-slim")
    .action(async (opts: { port: string; image: string }) => {
      const config = await readConfig(defaultConfigPath());

      if (!config.adminApiKey) {
        ui.error("Admin API key not set. Run `magi init` first.");
        process.exit(1);
      }

      const runtime = createLocalRuntime();
      const port = parseInt(opts.port, 10);

      // Create or get sandbox
      const existing = await runtime.sandbox.get("default");
      const sandbox =
        existing ??
        (await runtime.sandbox.create({
          name: "default",
          image: opts.image,
        }));

      const stop = ui.spinner.start("Starting sandbox...");
      await sandbox.start();
      stop("Sandbox ready.", "success");

      const env = {
        ADMIN_API_KEY: config.adminApiKey,
        kv: runtime.kv,
        deviceRepository: runtime.db.devices,
        sessionRepository: runtime.db.sessions,
        stepRepository: runtime.db.steps,
        sandbox,
      };

      const server = Bun.serve({
        port,
        fetch: (req) => app.fetch(req, env),
      });

      ui.success(`Gateway listening on http://localhost:${server.port}`);
      ui.info("Press Ctrl+C to stop.");

      const shutdown = async () => {
        ui.newline();
        const stopClean = ui.spinner.start("Shutting down...");
        await sandbox.stop();
        runtime.db.close();
        server.stop();
        stopClean("Shutdown complete.", "success");
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Keep process alive
      await new Promise(() => {});
    });
}

export function createGatewayEnv(runtime: Runtime, adminApiKey: string) {
  return {
    ADMIN_API_KEY: adminApiKey,
    kv: runtime.kv,
    deviceRepository: runtime.db.devices,
    sessionRepository: runtime.db.sessions,
    stepRepository: runtime.db.steps,
  };
}
