import { Command } from "commander";
import { readConfig, defaultConfigPath } from "../config";
import { createLocalRuntime } from "@magi/runtime";
import {
  Agent,
  AnthropicProvider,
  OpenRouterProvider,
  createSandboxTools,
  createBrowserTool,
  createTaskTool,
  createSessionLogger,
} from "@magi/agent";
import { Browser } from "@magi/browser";
import type { LLMProvider } from "@magi/agent";
import type { UI } from "../ui";

const CDP_PORT = 9222;
const CDP_HOST_PORT = 9223;
const CHROME_IMAGE = "zenika/alpine-chrome:latest";

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
    .option("--browser", "Enable browser tool with Chrome")
    .action(
      async (
        task: string,
        opts: {
          model?: string;
          image: string;
          systemPrompt?: string;
          maxSteps: string;
          provider: string;
          browser?: boolean;
        },
      ) => {
        const config = await readConfig(defaultConfigPath());
        const llm = createLLMProvider(opts.provider, config, ui);
        const model = opts.model ?? config.model;
        const runtime = createLocalRuntime();

        // Load secrets as placeholder env vars (injected per-exec, not per-container)
        const secrets = await runtime.db.secrets.list();
        const secretEnv: Record<string, string> = {};
        for (const s of secrets) {
          secretEnv[s.name] = s.placeholder;
        }

        // Get or create persistent sandbox
        const sandboxName = "default";
        const existing = await runtime.sandbox.get(sandboxName);
        const sandbox =
          existing ??
          (await runtime.sandbox.create({
            name: sandboxName,
            image: opts.image,
          }));

        // Chrome sandbox (separate container for browser)
        let browserInstance: Browser | undefined;
        let chromeSandboxName: string | undefined;

        try {
          const stop = ui.spinner.start("Starting sandbox...");
          await sandbox.start();
          await sandbox.exec("sh", [
            "-c",
            "rm -rf /workspace && mkdir -p /workspace",
          ]);
          stop("Sandbox ready.", "success");

          // Start Chrome if --browser flag
          if (opts.browser) {
            const stopBrowser = ui.spinner.start("Starting browser...");
            chromeSandboxName = "chrome";
            const chromeExisting = await runtime.sandbox.get(chromeSandboxName);
            const chromeSandbox =
              chromeExisting ??
              (await runtime.sandbox.create({
                name: chromeSandboxName,
                image: CHROME_IMAGE,
                ports: { [CDP_PORT]: CDP_HOST_PORT },
                command: [
                  "--no-sandbox",
                  "--remote-debugging-address=0.0.0.0",
                  `--remote-debugging-port=${CDP_PORT}`,
                  "--headless",
                  "about:blank",
                ],
              }));
            await chromeSandbox.start();

            // Wait for Chrome to be ready
            await waitForChrome(CDP_HOST_PORT);

            // Connect browser
            const pages = await fetch(
              `http://localhost:${CDP_HOST_PORT}/json/list`,
            );
            const list = (await pages.json()) as Array<{
              webSocketDebuggerUrl: string;
            }>;

            let cdpUrl: string;
            if (list.length > 0 && list[0]) {
              cdpUrl = list[0].webSocketDebuggerUrl;
            } else {
              // Create a new page
              const newPage = await fetch(
                `http://localhost:${CDP_HOST_PORT}/json/new`,
              );
              const page = (await newPage.json()) as {
                webSocketDebuggerUrl: string;
              };
              cdpUrl = page.webSocketDebuggerUrl;
            }

            browserInstance = new Browser({ cdpUrl });
            await browserInstance.connect();
            stopBrowser("Browser ready.", "success");
          }

          // Session logger
          const sessionId = crypto.randomUUID();
          const session = createSessionLogger(sessionId, {
            sessions: runtime.db.sessions,
            steps: runtime.db.steps,
          });

          // Build agent
          const sandboxTools = createSandboxTools(sandbox, {
            env: secretEnv,
            storage: runtime.storage,
          });
          const agentConfig = {
            llm,
            model,
            tools: sandboxTools,
            systemPrompt: opts.systemPrompt,
            maxSteps: parseInt(opts.maxSteps, 10),
            session,
          };
          const tools = [...sandboxTools, createTaskTool(agentConfig)];
          if (browserInstance) {
            tools.push(createBrowserTool(browserInstance));
          }
          agentConfig.tools = tools;

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
          if (browserInstance) {
            await browserInstance.close();
          }
          if (chromeSandboxName) {
            const chromeSandbox = await runtime.sandbox.get(chromeSandboxName);
            if (chromeSandbox) {
              await chromeSandbox.stop();
            }
          }
          const stopClean = ui.spinner.start("Stopping sandbox...");
          await sandbox.stop();
          stopClean("Sandbox stopped.", "success");
        }
      },
    );
}

async function waitForChrome(port: number, maxWaitMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Chrome did not start in time");
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
