import type { Sandbox } from "@magi/sandbox";
import type { Tool, ToolResult } from "../types";

export function createWriteFileTool(sandbox: Sandbox): Tool {
  return {
    name: "write_file",
    description:
      "Write content to a file in the sandbox. Creates the file and any parent directories if they don't exist. Overwrites existing files.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file to write",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["path", "content"],
    },
    async execute(input): Promise<ToolResult> {
      const { path, content } = input as { path: string; content: string };

      // Ensure parent directory exists
      const dirResult = await sandbox.exec("mkdir", [
        "-p",
        path.substring(0, path.lastIndexOf("/")),
      ]);
      if (dirResult.exitCode !== 0) {
        return {
          output: `Failed to create directory: ${dirResult.stderr.trim()}`,
          isError: true,
        };
      }

      // Write file using tee (handles special characters in content)
      const result = await sandbox.exec("sh", [
        "-c",
        `cat > ${shellEscape(path)} << 'MAGI_EOF'\n${content}\nMAGI_EOF`,
      ]);

      if (result.exitCode !== 0) {
        return {
          output: `Failed to write file: ${result.stderr.trim()}`,
          isError: true,
        };
      }

      return { output: `File written: ${path}` };
    },
  };
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
