#!/usr/bin/env node
import { Command } from "commander";
import { createUI } from "./ui";
import { deviceCommand } from "./commands/device";
import { initCommand } from "./commands/init";
import { runCommand } from "./commands/run";
import { serveCommand } from "./commands/serve";

const ui = createUI();

const program = new Command()
  .name("magi")
  .description("MAGI - Autonomous coding agent orchestrator")
  .version("0.1.0");

program.addCommand(initCommand(ui));
program.addCommand(deviceCommand(ui));
program.addCommand(runCommand(ui));
program.addCommand(serveCommand(ui));

program.parse();
