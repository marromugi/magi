import type { Tool, ToolResult } from "../types";

export function createDownloadTool(): Tool {
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
    async execute(): Promise<ToolResult> {
      // TODO: integrate with StorageProvider to extract file from sandbox
      return {
        output:
          "Download not yet implemented. Use exec to read files within the sandbox.",
        isError: true,
      };
    },
  };
}
