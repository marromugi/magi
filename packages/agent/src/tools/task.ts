import { Agent } from "../agent";
import type { AgentConfig, Tool, ToolResult } from "../types";

export function createTaskTool(parentConfig: AgentConfig): Tool {
  return {
    name: "task",
    description:
      "Delegate a sub-task to a fresh agent with its own context. Use this to break down complex work, explore questions without polluting your context, or run independent tasks in isolation. The sub-agent has access to the same tools as you.",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The task description for the sub-agent",
        },
        systemPrompt: {
          type: "string",
          description:
            "Optional system prompt to customize the sub-agent's behavior",
        },
      },
      required: ["task"],
    },
    async execute(input): Promise<ToolResult> {
      const { task, systemPrompt } = input as {
        task: string;
        systemPrompt?: string;
      };

      // Create sub-agent with same tools except task (prevent infinite recursion)
      const subTools = (parentConfig.tools ?? []).filter(
        (t) => t.name !== "task",
      );

      const subAgent = new Agent({
        llm: parentConfig.llm,
        model: parentConfig.model,
        tools: subTools,
        systemPrompt: systemPrompt ?? parentConfig.systemPrompt,
        maxSteps: parentConfig.maxSteps,
      });

      const parts: string[] = [];
      for await (const step of subAgent.run(task)) {
        if (step.type === "text") {
          parts.push(step.content);
        }
      }

      return {
        output: parts.join("\n") || "(sub-agent produced no text output)",
      };
    },
  };
}
