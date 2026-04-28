import type { Sandbox } from "@magi/sandbox";
import type { StorageProvider } from "@magi/storage";
import type { Tool, ToolResult } from "../types";

export function createDownloadTool(
  sandbox: Sandbox,
  storage: StorageProvider,
): Tool {
  return {
    name: "download",
    description:
      "Download a file from the sandbox to external storage. Use this to export results, artifacts, or generated files out of the sandbox.",
    inputSchema: {
      type: "object",
      properties: {
        sourcePath: {
          type: "string",
          description: "Path inside the sandbox",
        },
        destPath: {
          type: "string",
          description: "Destination path in external storage",
        },
      },
      required: ["sourcePath", "destPath"],
    },
    async execute(input): Promise<ToolResult> {
      const { sourcePath, destPath } = input as {
        sourcePath: string;
        destPath: string;
      };

      const data = await sandbox.copyFrom(sourcePath);
      await storage.write(destPath, data);
      return {
        output: `Downloaded ${sourcePath} → ${destPath} (${data.length} bytes)`,
      };
    },
  };
}
