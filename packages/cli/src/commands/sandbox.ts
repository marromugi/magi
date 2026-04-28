import { Command } from "commander";
import { createLocalRuntime } from "@magi/runtime";
import type { UI } from "../ui";

export function sandboxCommand(ui: UI): Command {
  const cmd = new Command("sandbox").description("Manage the sandbox");

  cmd
    .command("status")
    .description("Show sandbox status")
    .action(async () => {
      const runtime = createLocalRuntime();
      try {
        const sandbox = await runtime.sandbox.get("default");
        if (!sandbox) {
          ui.empty("No sandbox created yet. Run `magi run` to create one.");
          return;
        }
        const status = await sandbox.status();
        ui.keyValue([
          ["Name", "default"],
          ["Status", status],
        ]);
      } finally {
        runtime.db.close();
      }
    });

  cmd
    .command("snapshot")
    .description("Take a snapshot of the current sandbox")
    .option("--tag <tag>", "Snapshot tag", "manual")
    .action(async (opts: { tag: string }) => {
      const runtime = createLocalRuntime();
      try {
        const sandbox = await runtime.sandbox.get("default");
        if (!sandbox) {
          ui.error("No sandbox found. Run `magi run` first.");
          process.exit(1);
        }
        const stop = ui.spinner.start("Taking snapshot...");
        const info = await sandbox.snapshot(opts.tag);
        stop("Snapshot created.", "success");
        ui.keyValue([
          ["ID", info.id],
          ["Tag", info.tag],
          ["Created", info.createdAt],
        ]);
      } finally {
        runtime.db.close();
      }
    });

  cmd
    .command("reset")
    .description(
      "Reset sandbox to clean state (removes all installed packages)",
    )
    .action(async () => {
      const runtime = createLocalRuntime();
      try {
        const sandbox = await runtime.sandbox.get("default");
        if (!sandbox) {
          ui.empty("No sandbox to reset.");
          return;
        }
        const stop = ui.spinner.start("Resetting sandbox...");
        await sandbox.reset();
        stop("Sandbox reset.", "success");
      } finally {
        runtime.db.close();
      }
    });

  cmd
    .command("snapshots")
    .description("List available snapshots")
    .action(async () => {
      const runtime = createLocalRuntime();
      try {
        const snaps = await runtime.sandbox.snapshots("default");
        if (snaps.length === 0) {
          ui.empty("No snapshots.");
          return;
        }
        ui.header("Snapshots");
        ui.table({
          headers: ["ID", "Tag", "Created"],
          rows: snaps.map((s) => [s.id, s.tag, s.createdAt]),
        });
      } finally {
        runtime.db.close();
      }
    });

  cmd
    .command("restore")
    .description("Restore sandbox from a snapshot")
    .argument("<tag>", "Snapshot tag to restore")
    .action(async (tag: string) => {
      const runtime = createLocalRuntime();
      try {
        const sandbox = await runtime.sandbox.get("default");
        if (!sandbox) {
          ui.error("No sandbox found.");
          process.exit(1);
        }
        const stop = ui.spinner.start(`Restoring from ${tag}...`);
        await sandbox.restore(tag);
        stop(`Restored from ${tag}.`, "success");
      } finally {
        runtime.db.close();
      }
    });

  return cmd;
}
