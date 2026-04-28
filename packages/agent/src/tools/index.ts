import type { Sandbox } from "@magi/sandbox";
import type { AgentConfig, Tool } from "../types";
import { createExecTool } from "./exec";
import { createUploadTool } from "./upload";
import { createDownloadTool } from "./download";
import { createTaskTool } from "./task";

export function createSandboxTools(sandbox: Sandbox): Tool[] {
  return [createExecTool(sandbox), createUploadTool(), createDownloadTool()];
}

export function createAllTools(
  sandbox: Sandbox,
  agentConfig: AgentConfig,
): Tool[] {
  return [...createSandboxTools(sandbox), createTaskTool(agentConfig)];
}

export { createExecTool } from "./exec";
export { createUploadTool } from "./upload";
export { createDownloadTool } from "./download";
export { createTaskTool } from "./task";
