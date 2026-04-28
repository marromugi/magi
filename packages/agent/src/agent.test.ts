import { describe, it, expect } from "bun:test";
import { Agent } from "./agent";
import type { Tool, ToolResult, AgentStep } from "./types";
import type { LLMProvider, ChatResponse } from "./llm";

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

function createMockTool(
  name: string,
  handler: (input: Record<string, unknown>) => Promise<ToolResult>,
): Tool {
  return {
    name,
    description: `Mock tool: ${name}`,
    inputSchema: { type: "object", properties: {} },
    execute: handler,
  };
}

async function collectSteps(
  gen: AsyncGenerator<AgentStep>,
): Promise<AgentStep[]> {
  const steps: AgentStep[] = [];
  for await (const step of gen) {
    steps.push(step);
  }
  return steps;
}

describe("Agent", () => {
  it("yields text response when no tools are called", async () => {
    const llm = createMockLLM([
      {
        content: [{ type: "text", text: "Hello!" }],
        stopReason: "end_turn",
      },
    ]);

    const agent = new Agent({ llm, model: "test", maxSteps: 3 });
    const steps = await collectSteps(agent.run("Say hello"));

    expect(steps).toHaveLength(1);
    expect(steps[0]!.type).toBe("text");
    expect(steps[0]!.content).toBe("Hello!");
  });

  it("executes tool calls and feeds results back", async () => {
    const llm = createMockLLM([
      // First response: tool call
      {
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "greet",
            input: { name: "world" },
          },
        ],
        stopReason: "tool_use",
      },
      // Second response: text with result
      {
        content: [{ type: "text", text: "Done: Hello, world!" }],
        stopReason: "end_turn",
      },
    ]);

    const greetTool = createMockTool("greet", async (input) => ({
      output: `Hello, ${(input as { name: string }).name}!`,
    }));

    const agent = new Agent({
      llm,
      model: "test",
      tools: [greetTool],
      maxSteps: 5,
    });

    const steps = await collectSteps(agent.run("Greet the world"));

    expect(steps).toHaveLength(3); // tool_call + tool_result + text
    expect(steps[0]!.type).toBe("tool_call");
    expect(steps[0]!.toolName).toBe("greet");
    expect(steps[1]!.type).toBe("tool_result");
    expect(steps[1]!.content).toBe("Hello, world!");
    expect(steps[2]!.type).toBe("text");
    expect(steps[2]!.content).toContain("Done");
  });

  it("handles multiple tool calls in one response", async () => {
    const llm = createMockLLM([
      {
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "add",
            input: { a: 1, b: 2 },
          },
          {
            type: "tool_use",
            id: "call_2",
            name: "add",
            input: { a: 3, b: 4 },
          },
        ],
        stopReason: "tool_use",
      },
      {
        content: [{ type: "text", text: "Results: 3 and 7" }],
        stopReason: "end_turn",
      },
    ]);

    const addTool = createMockTool("add", async (input) => {
      const { a, b } = input as { a: number; b: number };
      return { output: String(a + b) };
    });

    const agent = new Agent({
      llm,
      model: "test",
      tools: [addTool],
      maxSteps: 5,
    });

    const steps = await collectSteps(agent.run("Add numbers"));
    const toolCalls = steps.filter((s) => s.type === "tool_call");
    const toolResults = steps.filter((s) => s.type === "tool_result");

    expect(toolCalls).toHaveLength(2);
    expect(toolResults).toHaveLength(2);
    expect(toolResults[0]!.content).toBe("3");
    expect(toolResults[1]!.content).toBe("7");
  });

  it("stops at max steps", async () => {
    const llm = createMockLLM([
      {
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "loop",
            input: {},
          },
        ],
        stopReason: "tool_use",
      },
      {
        content: [
          {
            type: "tool_use",
            id: "call_2",
            name: "loop",
            input: {},
          },
        ],
        stopReason: "tool_use",
      },
    ]);

    const loopTool = createMockTool("loop", async () => ({
      output: "again",
    }));

    const agent = new Agent({
      llm,
      model: "test",
      tools: [loopTool],
      maxSteps: 2,
    });

    const steps = await collectSteps(agent.run("Loop"));
    const lastStep = steps[steps.length - 1]!;
    expect(lastStep.content).toContain("maximum steps");
  });

  it("handles unknown tool gracefully", async () => {
    const llm = createMockLLM([
      {
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "nonexistent",
            input: {},
          },
        ],
        stopReason: "tool_use",
      },
      {
        content: [{ type: "text", text: "Tool not found" }],
        stopReason: "end_turn",
      },
    ]);

    const agent = new Agent({ llm, model: "test", maxSteps: 3 });
    const steps = await collectSteps(agent.run("Use unknown tool"));

    const toolResult = steps.find((s) => s.type === "tool_result");
    expect(toolResult!.content).toContain("Unknown tool");
  });

  it("handles tool execution errors", async () => {
    const llm = createMockLLM([
      {
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "fail",
            input: {},
          },
        ],
        stopReason: "tool_use",
      },
      {
        content: [{ type: "text", text: "Error handled" }],
        stopReason: "end_turn",
      },
    ]);

    const failTool = createMockTool("fail", async () => {
      throw new Error("Something broke");
    });

    const agent = new Agent({
      llm,
      model: "test",
      tools: [failTool],
      maxSteps: 3,
    });

    const steps = await collectSteps(agent.run("Use failing tool"));
    const toolResult = steps.find((s) => s.type === "tool_result");
    expect(toolResult!.content).toContain("Something broke");
  });
});
