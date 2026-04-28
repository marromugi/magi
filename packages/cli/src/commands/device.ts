import { Command } from "commander";
import { AdminClient } from "../client";
import { readConfig, defaultConfigPath } from "../config";
import type { UI } from "../ui";
import { renderQR } from "../ui/qr";

function createClient(ui: UI, configPath: string) {
  return async () => {
    const config = await readConfig(configPath);
    if (!config.workerUrl || !config.adminApiKey) {
      ui.error(
        "Not configured. Run `magi init` to set up worker URL and admin API key.",
      );
      process.exit(1);
    }
    return new AdminClient(config);
  };
}

export function deviceCommand(
  ui: UI,
  configPath = defaultConfigPath(),
): Command {
  const getClient = createClient(ui, configPath);
  const device = new Command("device").description("Manage paired devices");

  device
    .command("invite")
    .description("Generate a bootstrap token for device pairing")
    .action(async () => {
      const client = await getClient();
      const stop = ui.spinner.start("Generating invite...");
      const result = await client.createInvite();
      const pairUrl = `${(await readConfig(configPath)).workerUrl}/pair`;
      stop("Bootstrap token generated.", "success");

      ui.newline();
      ui.keyValue([
        ["Token", result.bootstrapToken],
        ["Pairing ID", result.pairingId],
        ["Pair URL", pairUrl],
      ]);
      ui.newline();
      ui.info("The token expires in 10 minutes.");

      // Show QR code for easy pairing
      const pairingData = JSON.stringify({
        url: pairUrl,
        token: result.bootstrapToken,
      });
      const qr = await renderQR(pairingData);
      if (qr !== pairingData) {
        ui.newline();
        ui.header("Scan to pair");
        console.log(qr);
      }
    });

  device
    .command("list")
    .description("List all paired devices")
    .action(async () => {
      const client = await getClient();
      const stop = ui.spinner.start("Fetching devices...");
      const result = await client.listDevices();
      stop();

      if (result.devices.length === 0) {
        ui.empty("No paired devices.");
        return;
      }

      ui.header("Paired devices");
      ui.table({
        headers: ["ID", "Name", "Status"],
        rows: result.devices.map((d) => [d.id, d.name, d.status]),
      });
    });

  device
    .command("revoke")
    .description("Revoke a paired device")
    .argument("<deviceId>", "Device ID to revoke")
    .action(async (deviceId: string) => {
      const client = await getClient();
      const stop = ui.spinner.start("Revoking device...");
      await client.revokeDevice(deviceId);
      stop(`Device ${deviceId} revoked.`, "success");
    });

  return device;
}
