import type { Tool, ToolResult } from "../types";

export function createUploadTool(): Tool {
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
    async execute(): Promise<ToolResult> {
      // TODO: integrate with StorageProvider to read file and inject into sandbox
      return {
        output:
          "Upload not yet implemented. Use exec to create files within the sandbox.",
        isError: true,
      };
    },
  };
}
