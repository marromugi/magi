import type { Sandbox } from "@magi/sandbox";
import type { Browser } from "@magi/browser";
import type { AgentConfig, Tool } from "../types";
import { createExecTool } from "./exec";
import { createUploadTool } from "./upload";
import { createDownloadTool } from "./download";
import { createBrowserTool } from "./browser";
import { createTaskTool } from "./task";

export function createSandboxTools(sandbox: Sandbox): Tool[] {
  return [createExecTool(sandbox), createUploadTool(), createDownloadTool()];
}

export function createAllTools(
  sandbox: Sandbox,
  agentConfig: AgentConfig,
  browser?: Browser,
): Tool[] {
  const tools = [...createSandboxTools(sandbox), createTaskTool(agentConfig)];
  if (browser) {
    tools.push(createBrowserTool(browser));
  }
  return tools;
}

export { createExecTool } from "./exec";
export { createUploadTool } from "./upload";
export { createDownloadTool } from "./download";
export { createBrowserTool } from "./browser";
export { createTaskTool } from "./task";
