import type { Message, ContentBlock, ToolResultBlock } from "./llm";
import type {
  AgentConfig,
  AgentStep,
  Tool,
  ToolResult,
  SessionLogger,
} from "./types";

const DEFAULT_MAX_STEPS = 50;

export class Agent {
  private config: AgentConfig;
  private toolMap: Map<string, Tool>;
  private messages: Message[] = [];
  private session: SessionLogger | undefined;

  constructor(config: AgentConfig) {
    this.config = config;
    this.toolMap = new Map((config.tools ?? []).map((t) => [t.name, t]));
    this.session = config.session;
  }

  async *run(task: string): AsyncGenerator<AgentStep> {
    const userStep: AgentStep = { type: "user_message", content: task };
    await this.session?.logStep(userStep);
    yield userStep;

    this.messages.push({ role: "user", content: task });

    const maxSteps = this.config.maxSteps ?? DEFAULT_MAX_STEPS;
    const tools = this.config.tools ?? [];

    try {
      for (let step = 0; step < maxSteps; step++) {
        const response = await this.config.llm.chat({
          model: this.config.model,
          system: this.config.systemPrompt,
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
          messages: this.messages,
        });

        const assistantContent: ContentBlock[] = response.content;
        const toolUseBlocks = response.content.filter(
          (b): b is ContentBlock & { type: "tool_use" } =>
            b.type === "tool_use",
        );

        for (const block of response.content) {
          if (block.type === "text" && block.text.trim()) {
            const textStep: AgentStep = { type: "text", content: block.text };
            await this.session?.logStep(textStep);
            yield textStep;
          }
        }

        this.messages.push({ role: "assistant", content: assistantContent });

        if (toolUseBlocks.length === 0) {
          await this.session?.complete();
          return;
        }

        const toolResults: ToolResultBlock[] = [];

        for (const toolUse of toolUseBlocks) {
          const callStep: AgentStep = {
            type: "tool_call",
            toolName: toolUse.name,
            toolInput: toolUse.input,
            content: `${toolUse.name}(${JSON.stringify(toolUse.input)})`,
          };
          await this.session?.logStep(callStep);
          yield callStep;

          const result = await this.executeTool(toolUse.name, toolUse.input);

          const resultStep: AgentStep = {
            type: "tool_result",
            toolName: toolUse.name,
            content: result.output,
          };
          await this.session?.logStep(resultStep);
          yield resultStep;

          toolResults.push({
            type: "tool_result",
            toolUseId: toolUse.id,
            content: result.output,
            isError: result.isError,
          });
        }

        this.messages.push({ role: "user", content: toolResults });
      }

      const maxStepMsg: AgentStep = {
        type: "text",
        content: `Agent reached maximum steps (${maxSteps}). Task may be incomplete.`,
      };
      await this.session?.logStep(maxStepMsg);
      await this.session?.fail("max steps reached");
      yield maxStepMsg;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      await this.session?.fail(errorMsg);
      throw e;
    }
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
