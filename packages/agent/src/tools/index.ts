import type { Sandbox } from "@magi/sandbox";
import type { AgentConfig, Tool } from "../types";
import { createExecTool } from "./exec";
import { createReadFileTool } from "./read-file";
import { createWriteFileTool } from "./write-file";
import { createTaskTool } from "./task";

export function createSandboxTools(sandbox: Sandbox): Tool[] {
  return [
    createExecTool(sandbox),
    createReadFileTool(sandbox),
    createWriteFileTool(sandbox),
  ];
}

export function createAllTools(
  sandbox: Sandbox,
  agentConfig: AgentConfig,
): Tool[] {
  return [...createSandboxTools(sandbox), createTaskTool(agentConfig)];
}

export { createExecTool } from "./exec";
export { createReadFileTool } from "./read-file";
export { createWriteFileTool } from "./write-file";
export { createTaskTool } from "./task";
