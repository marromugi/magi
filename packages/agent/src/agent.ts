import type {
  LLMProvider,
  Message,
  ContentBlock,
  ToolResultBlock,
} from "./llm";
import type { AgentConfig, AgentStep, Tool, ToolResult } from "./types";

const DEFAULT_MAX_STEPS = 50;

export class Agent {
  private llm: LLMProvider;
  private model: string;
  private tools: Tool[];
  private toolMap: Map<string, Tool>;
  private systemPrompt: string | undefined;
  private maxSteps: number;
  private messages: Message[] = [];

  constructor(config: AgentConfig) {
    this.llm = config.llm;
    this.model = config.model;
    this.tools = config.tools ?? [];
    this.toolMap = new Map(this.tools.map((t) => [t.name, t]));
    this.systemPrompt = config.systemPrompt;
    this.maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
  }

  async *run(task: string): AsyncGenerator<AgentStep> {
    this.messages.push({ role: "user", content: task });

    for (let step = 0; step < this.maxSteps; step++) {
      const response = await this.llm.chat({
        model: this.model,
        system: this.systemPrompt,
        tools: this.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        messages: this.messages,
      });

      // Collect assistant content
      const assistantContent: ContentBlock[] = response.content;
      const toolUseBlocks = response.content.filter(
        (b): b is ContentBlock & { type: "tool_use" } => b.type === "tool_use",
      );

      // Yield text blocks
      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) {
          yield { type: "text", content: block.text };
        }
      }

      this.messages.push({ role: "assistant", content: assistantContent });

      // No tool calls = done
      if (toolUseBlocks.length === 0) {
        return;
      }

      // Execute tool calls
      const toolResults: ToolResultBlock[] = [];

      for (const toolUse of toolUseBlocks) {
        yield {
          type: "tool_call",
          toolName: toolUse.name,
          toolInput: toolUse.input,
          content: `${toolUse.name}(${JSON.stringify(toolUse.input)})`,
        };

        const result = await this.executeTool(toolUse.name, toolUse.input);

        yield {
          type: "tool_result",
          toolName: toolUse.name,
          content: result.output,
        };

        toolResults.push({
          type: "tool_result",
          toolUseId: toolUse.id,
          content: result.output,
          isError: result.isError,
        });
      }

      this.messages.push({ role: "user", content: toolResults });
    }

    yield {
      type: "text",
      content: `Agent reached maximum steps (${this.maxSteps}). Task may be incomplete.`,
    };
  }

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this.toolMap.get(name);
    if (!tool) {
      return { output: `Unknown tool: ${name}`, isError: true };
    }

    try {
      return await tool.execute(input);
    } catch (e) {
      return {
        output: `Tool error: ${e instanceof Error ? e.message : String(e)}`,
        isError: true,
      };
    }
  }
}
