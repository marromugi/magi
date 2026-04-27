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
    .description("Configure MAGI CLI (worker URL and admin API key)")
    .option("--worker-url <url>", "Worker URL")
    .option("--admin-api-key <key>", "Admin API key")
    .action(async (opts: { workerUrl?: string; adminApiKey?: string }) => {
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

      await writeConfig(configPath, { workerUrl, adminApiKey });
      ui.success(`Configuration saved to ${configPath}`);
    });
}
