import { Command } from "commander";
import { readConfig, defaultConfigPath } from "../config";
import { createLocalRuntime } from "@magi/runtime";
import { AnthropicProvider, OpenRouterProvider } from "@magi/agent";
import type { LLMProvider } from "@magi/agent";
import app from "@magi/gateway";
import type { UI } from "../ui";

export function serveCommand(ui: UI): Command {
  return new Command("serve")
    .description("Start the MAGI gateway server")
    .option("--port <port>", "Port to listen on", "3000")
    .option("--image <image>", "Docker image for sandbox", "node:22-slim")
    .option(
      "--provider <provider>",
      "LLM provider (anthropic, openrouter)",
      "anthropic",
    )
    .option("--model <model>", "Default LLM model")
    .action(
      async (opts: {
        port: string;
        image: string;
        provider: string;
        model?: string;
      }) => {
        const config = await readConfig(defaultConfigPath());

        if (!config.adminApiKey) {
          ui.error("Admin API key not set. Run `magi init` first.");
          process.exit(1);
        }

        const llm = createLLMProvider(opts.provider, config, ui);
        const runtime = createLocalRuntime();
        const port = parseInt(opts.port, 10);

        // Create or get sandbox with proxy env pointing to gateway
        const proxyUrl = `http://host.docker.internal:${port}/proxy`;
        const existing = await runtime.sandbox.get("default");
        const sandbox =
          existing ??
          (await runtime.sandbox.create({
            name: "default",
            image: opts.image,
            env: {
              MAGI_PROXY_URL: proxyUrl,
            },
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
          secretRepository: runtime.db.secrets,
          sandbox,
          llm,
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

        await new Promise(() => {});
      },
    );
}

function createLLMProvider(
  provider: string,
  config: { anthropicApiKey: string },
  ui: UI,
): LLMProvider {
  switch (provider) {
    case "anthropic": {
      const apiKey = process.env["ANTHROPIC_API_KEY"] || config.anthropicApiKey;
      if (!apiKey) {
        ui.error("ANTHROPIC_API_KEY not set.");
        process.exit(1);
      }
      return new AnthropicProvider({ apiKey });
    }
    case "openrouter": {
      const apiKey = process.env["OPENROUTER_API_KEY"];
      if (!apiKey) {
        ui.error("OPENROUTER_API_KEY not set.");
        process.exit(1);
      }
      return new OpenRouterProvider({ apiKey });
    }
    default:
      ui.error(`Unknown provider: ${provider}`);
      process.exit(1);
  }
}
