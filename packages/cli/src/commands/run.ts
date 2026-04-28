import { Command } from "commander";
import { readConfig, defaultConfigPath } from "../config";
import { createLocalRuntime } from "@magi/runtime";
import {
  Agent,
  AnthropicProvider,
  OpenRouterProvider,
  createSandboxTools,
  createTaskTool,
  createSessionLogger,
} from "@magi/agent";
import type { LLMProvider } from "@magi/agent";
import type { UI } from "../ui";

export function runCommand(ui: UI): Command {
  return new Command("run")
    .description("Run an agent task in a sandbox")
    .argument("<task>", "Task description for the agent")
    .option("--model <model>", "LLM model to use")
    .option("--image <image>", "Docker image for sandbox", "node:22-slim")
    .option("--system-prompt <prompt>", "System prompt for the agent")
    .option("--max-steps <n>", "Maximum agent steps", "50")
    .option(
      "--provider <provider>",
      "LLM provider (anthropic, openrouter)",
      "anthropic",
    )
    .action(
      async (
        task: string,
        opts: {
          model?: string;
          image: string;
          systemPrompt?: string;
          maxSteps: string;
          provider: string;
        },
      ) => {
        const config = await readConfig(defaultConfigPath());
        const llm = createLLMProvider(opts.provider, config, ui);
        const model = opts.model ?? config.model;
        const runtime = createLocalRuntime();

        // Create sandbox
        const sandboxName = `run-${Date.now()}`;
        ui.info(`Creating sandbox (${opts.image})...`);
        const sandbox = await runtime.sandbox.create({
          name: sandboxName,
          image: opts.image,
        });

        try {
          const stop = ui.spinner.start("Starting sandbox...");
          await sandbox.start();
          stop("Sandbox ready.", "success");

          // Session logger
          const sessionId = crypto.randomUUID();
          const session = createSessionLogger(sessionId, {
            sessions: runtime.db.sessions,
            steps: runtime.db.steps,
          });

          // Build agent
          const sandboxTools = createSandboxTools(sandbox);
          const agentConfig = {
            llm,
            model,
            tools: sandboxTools,
            systemPrompt: opts.systemPrompt,
            maxSteps: parseInt(opts.maxSteps, 10),
            session,
          };
          // Add task tool with access to same config
          agentConfig.tools = [...sandboxTools, createTaskTool(agentConfig)];

          const agent = new Agent(agentConfig);

          ui.newline();
          ui.header(`Session ${sessionId.slice(0, 8)}`);
          ui.newline();

          for await (const step of agent.run(task)) {
            switch (step.type) {
              case "user_message":
                ui.info(step.content);
                break;
              case "tool_call":
                ui.keyValue([
                  ["tool", step.toolName ?? ""],
                  ["input", truncate(JSON.stringify(step.toolInput), 200)],
                ]);
                break;
              case "tool_result": {
                const preview = truncate(step.content, 500);
                if (step.content.includes("[exit code: 0]")) {
                  ui.success(preview);
                } else {
                  ui.warn(preview);
                }
                ui.newline();
                break;
              }
              case "text":
                console.log(step.content);
                ui.newline();
                break;
            }
          }

          ui.success(`Session ${sessionId.slice(0, 8)} completed.`);
        } catch (e) {
          ui.error(
            `Agent error: ${e instanceof Error ? e.message : String(e)}`,
          );
          process.exit(1);
        } finally {
          const stopClean = ui.spinner.start("Stopping sandbox...");
          await sandbox.stop();
          stopClean("Sandbox stopped.", "success");
        }
      },
    );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
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
        ui.error("ANTHROPIC_API_KEY not set. Set via env or `magi init`.");
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
