import type { Sandbox } from "@magi/sandbox";
import type { StorageProvider } from "@magi/storage";
import type { Tool, ToolResult } from "../types";

export function createUploadTool(
  sandbox: Sandbox,
  storage: StorageProvider,
): Tool {
  return {
    name: "upload",
    description:
      "Upload a file from external storage into the sandbox. Use this to bring in files that exist outside the sandbox (e.g. downloaded PDFs, assets from storage).",
    inputSchema: {
      type: "object",
      properties: {
        sourcePath: {
          type: "string",
          description: "Path in external storage",
        },
        destPath: {
          type: "string",
          description: "Destination path inside the sandbox",
        },
      },
      required: ["sourcePath", "destPath"],
    },
    async execute(input): Promise<ToolResult> {
      const { sourcePath, destPath } = input as {
        sourcePath: string;
        destPath: string;
      };

      const data = await storage.read(sourcePath);
      if (!data) {
        return {
          output: `File not found in storage: ${sourcePath}`,
          isError: true,
        };
      }

      await sandbox.copyTo(destPath, data);
      return {
        output: `Uploaded ${sourcePath} → ${destPath} (${data.length} bytes)`,
      };
    },
  };
}
