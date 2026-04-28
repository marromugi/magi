import { describe, it, expect } from "bun:test";
import { createTaskTool } from "./task";
import type { LLMProvider, ChatResponse } from "../llm";
import type { AgentConfig } from "../types";

function createMockLLM(responses: ChatResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    name: "mock",
    async chat(): Promise<ChatResponse> {
      const response = responses[callIndex];
      if (!response) throw new Error("No more mock responses");
      callIndex++;
      return response;
    },
  };
}

describe("task tool", () => {
  it("delegates a task to a sub-agent and returns text output", async () => {
    const llm = createMockLLM([
      {
        content: [{ type: "text", text: "Sub-agent result: 42" }],
        stopReason: "end_turn",
      },
    ]);

    const config: AgentConfig = {
      llm,
      model: "test",
      tools: [],
      maxSteps: 5,
    };

    const tool = createTaskTool(config);
    const result = await tool.execute({ task: "What is 6 * 7?" });

    expect(result.output).toBe("Sub-agent result: 42");
    expect(result.isError).toBeFalsy();
  });

  it("excludes task tool from sub-agent to prevent recursion", async () => {
    const llm = createMockLLM([
      {
        content: [{ type: "text", text: "Done" }],
        stopReason: "end_turn",
      },
    ]);

    let capturedTools: string[] = [];
    const spyLlm: LLMProvider = {
      name: "spy",
      async chat(params) {
        capturedTools = params.tools?.map((t) => t.name) ?? [];
        return llm.chat(params);
      },
    };

    const config: AgentConfig = {
      llm: spyLlm,
      model: "test",
      tools: [
        {
          name: "exec",
          description: "exec",
          inputSchema: { type: "object" },
          execute: async () => ({ output: "ok" }),
        },
        createTaskTool({ llm: spyLlm, model: "test", tools: [] }),
      ],
      maxSteps: 5,
    };

    const tool = createTaskTool(config);
    await tool.execute({ task: "test" });

    // Sub-agent should have exec but NOT task
    expect(capturedTools).toContain("exec");
    expect(capturedTools).not.toContain("task");
  });

  it("returns fallback when sub-agent produces no text", async () => {
    const llm = createMockLLM([
      {
        content: [],
        stopReason: "end_turn",
      },
    ]);

    const config: AgentConfig = { llm, model: "test", maxSteps: 3 };
    const tool = createTaskTool(config);
    const result = await tool.execute({ task: "empty task" });

    expect(result.output).toContain("no text output");
  });
});
