import type { Sandbox } from "@magi/sandbox";
import type { StorageProvider } from "@magi/storage";
import type { Browser } from "@magi/browser";
import type { AgentConfig, Tool } from "../types";
import { createExecTool } from "./exec";
import { createUploadTool } from "./upload";
import { createDownloadTool } from "./download";
import { createBrowserTool } from "./browser";
import { createTaskTool } from "./task";

export interface SandboxToolsOptions {
  env?: Record<string, string>;
  storage?: StorageProvider;
}

export function createSandboxTools(
  sandbox: Sandbox,
  options?: SandboxToolsOptions,
): Tool[] {
  const tools: Tool[] = [createExecTool(sandbox, { env: options?.env })];
  if (options?.storage) {
    tools.push(
      createUploadTool(sandbox, options.storage),
      createDownloadTool(sandbox, options.storage),
    );
  }
  return tools;
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
