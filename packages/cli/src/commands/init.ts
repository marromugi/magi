import { Command } from "commander";
import { writeConfig, readConfig, defaultConfigPath } from "../config";
import { createInterface } from "readline";
import type { UI } from "../ui";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function initCommand(ui: UI, configPath = defaultConfigPath()): Command {
  return new Command("init")
    .description("Configure MAGI CLI")
    .option("--worker-url <url>", "Worker URL")
    .option("--admin-api-key <key>", "Admin API key")
    .option("--anthropic-api-key <key>", "Anthropic API key")
    .option("--model <model>", "Default LLM model")
    .action(
      async (opts: {
        workerUrl?: string;
        adminApiKey?: string;
        anthropicApiKey?: string;
        model?: string;
      }) => {
        const existing = await readConfig(configPath);

        const workerUrl =
          (opts.workerUrl ??
            (await prompt(
              `Worker URL${existing.workerUrl ? ` (${existing.workerUrl})` : ""}: `,
            ))) ||
          existing.workerUrl;

        const adminApiKey =
          (opts.adminApiKey ??
            (await prompt(
              `Admin API Key${existing.adminApiKey ? " (****)" : ""}: `,
            ))) ||
          existing.adminApiKey;

        const anthropicApiKey =
          (opts.anthropicApiKey ??
            (await prompt(
              `Anthropic API Key${existing.anthropicApiKey ? " (****)" : ""}: `,
            ))) ||
          existing.anthropicApiKey;

        const model =
          (opts.model ??
            (await prompt(
              `Model${existing.model ? ` (${existing.model})` : ""}: `,
            ))) ||
          existing.model;

        await writeConfig(configPath, {
          workerUrl,
          adminApiKey,
          anthropicApiKey,
          model,
        });
        ui.success(`Configuration saved to ${configPath}`);
      },
    );
}
