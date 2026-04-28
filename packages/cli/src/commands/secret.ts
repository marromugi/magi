import { Command } from "commander";
import { createLocalRuntime } from "@magi/runtime";
import type { UI } from "../ui";

function generatePlaceholder(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `magi_s_${hex}`;
}

export function secretCommand(ui: UI): Command {
  const secret = new Command("secret").description("Manage secrets");

  secret
    .command("add")
    .description(
      "Add a secret (stored locally, injected as placeholder into sandbox)",
    )
    .argument("<name>", "Secret name (e.g. TWITTER_API_KEY)")
    .argument("<value>", "Secret value")
    .action(async (name: string, value: string) => {
      const runtime = createLocalRuntime();
      try {
        const existing = await runtime.db.secrets.findByName(name);
        if (existing) {
          ui.error(
            `Secret "${name}" already exists. Remove it first with \`magi secret remove ${name}\`.`,
          );
          process.exit(1);
        }

        const placeholder = generatePlaceholder();
        await runtime.db.secrets.insert({
          name,
          value,
          placeholder,
          createdAt: new Date().toISOString(),
        });

        ui.success(`Secret "${name}" added.`);
        ui.keyValue([
          ["Name", name],
          ["Placeholder", placeholder],
        ]);
        ui.newline();
        ui.info("The sandbox will see the placeholder, not the real value.");
      } finally {
        runtime.db.close();
      }
    });

  secret
    .command("list")
    .description("List all secrets (values are hidden)")
    .action(async () => {
      const runtime = createLocalRuntime();
      try {
        const secrets = await runtime.db.secrets.list();

        if (secrets.length === 0) {
          ui.empty("No secrets configured.");
          return;
        }

        ui.header("Secrets");
        ui.table({
          headers: ["Name", "Placeholder", "Created"],
          rows: secrets.map((s) => [
            s.name,
            s.placeholder,
            s.createdAt.slice(0, 10),
          ]),
        });
      } finally {
        runtime.db.close();
      }
    });

  secret
    .command("remove")
    .description("Remove a secret")
    .argument("<name>", "Secret name to remove")
    .action(async (name: string) => {
      const runtime = createLocalRuntime();
      try {
        const existing = await runtime.db.secrets.findByName(name);
        if (!existing) {
          ui.error(`Secret "${name}" not found.`);
          process.exit(1);
        }

        await runtime.db.secrets.delete(name);
        ui.success(`Secret "${name}" removed.`);
      } finally {
        runtime.db.close();
      }
    });

  return secret;
}
