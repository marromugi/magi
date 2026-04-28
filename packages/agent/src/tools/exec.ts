import type { Sandbox } from "@magi/sandbox";
import type { Tool, ToolResult } from "../types";

export interface ExecToolOptions {
  env?: Record<string, string>;
}

export function createExecTool(
  sandbox: Sandbox,
  options?: ExecToolOptions,
): Tool {
  return {
    name: "exec",
    description:
      "Execute a command in the sandbox. Use this to run shell commands, install packages, compile code, run scripts, etc.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The command to execute",
        },
        args: {
          type: "array",
          items: { type: "string" },
          description: "Command arguments",
        },
      },
      required: ["command"],
    },
    async execute(input): Promise<ToolResult> {
      const { command, args } = input as { command: string; args?: string[] };
      const result = await sandbox.exec(command, args, { env: options?.env });

      const parts: string[] = [];
      if (result.stdout) parts.push(result.stdout);
      if (result.stderr) parts.push(`[stderr] ${result.stderr}`);
      if (parts.length === 0) parts.push("(no output)");

      return {
        output: `[exit code: ${result.exitCode}]\n${parts.join("\n")}`,
        isError: result.exitCode !== 0,
      };
    },
  };
}
