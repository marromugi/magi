import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  ChatParams,
  ChatResponse,
  ContentBlock,
  Message,
  ToolResultBlock,
} from "./types";

export interface AnthropicProviderOptions {
  apiKey: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      system: params.system,
      tools: params.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
      })),
      messages: params.messages.map(toAnthropicMessage),
    });

    const content: ContentBlock[] = response.content.map((block) => {
      if (block.type === "text") {
        return { type: "text" as const, text: block.text };
      }
      return {
        type: "tool_use" as const,
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      };
    });

    return {
      content,
      stopReason: response.stop_reason as ChatResponse["stopReason"],
    };
  }
}

function toAnthropicMessage(msg: Message): Anthropic.MessageParam {
  if (msg.role === "user") {
    if (typeof msg.content === "string") {
      return { role: "user", content: msg.content };
    }
    // Tool results
    return {
      role: "user",
      content: (msg.content as ToolResultBlock[]).map((r) => ({
        type: "tool_result" as const,
        tool_use_id: r.toolUseId,
        content: r.content,
        is_error: r.isError,
      })),
    };
  }

  return {
    role: "assistant",
    content: msg.content.map((block) => {
      if (block.type === "text") {
        return { type: "text" as const, text: block.text };
      }
      return {
        type: "tool_use" as const,
        id: block.id,
        name: block.name,
        input: block.input,
      };
    }),
  };
}
