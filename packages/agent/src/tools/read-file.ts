import type { Sandbox } from "@magi/sandbox";
import type { Tool, ToolResult } from "../types";

export function createReadFileTool(sandbox: Sandbox): Tool {
  return {
    name: "read_file",
    description:
      "Read the contents of a file in the sandbox. Returns the file content as text.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file to read",
        },
      },
      required: ["path"],
    },
    async execute(input): Promise<ToolResult> {
      const { path } = input as { path: string };
      const result = await sandbox.exec("cat", [path]);

      if (result.exitCode !== 0) {
        return {
          output: `Failed to read file: ${result.stderr.trim()}`,
          isError: true,
        };
      }

      return { output: result.stdout };
    },
  };
}
