import type {
  LLMProvider,
  ChatParams,
  ChatResponse,
  ContentBlock,
  ToolResultBlock,
} from "./types";

export interface OpenRouterProviderOptions {
  apiKey: string;
  baseUrl?: string;
  maxRetries?: number;
}

interface OpenRouterMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenRouterResponse {
  choices?: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  error?: {
    message: string;
    code: number;
  };
}

export class OpenRouterProvider implements LLMProvider {
  readonly name = "openrouter";
  private apiKey: string;
  private baseUrl: string;
  private maxRetries: number;

  constructor(options: OpenRouterProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://openrouter.ai/api/v1";
    this.maxRetries = options.maxRetries ?? 3;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const messages = this.buildMessages(params);

    const body: Record<string, unknown> = {
      model: params.model,
      messages,
      max_tokens: params.maxTokens ?? 4096,
    };

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        if (attempt < this.maxRetries) {
          const waitMs = Math.min(1000 * 2 ** attempt, 10000);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw new Error(
          `OpenRouter rate limited after ${this.maxRetries + 1} attempts`,
        );
      }

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`OpenRouter API error (${res.status}): ${error}`);
      }

      const data = (await res.json()) as OpenRouterResponse;

      if (data.error) {
        throw new Error(
          `OpenRouter error: ${data.error.message} (${data.error.code})`,
        );
      }

      const choice = data.choices?.[0];
      if (!choice) {
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw new Error("OpenRouter returned empty response");
      }

      return this.parseResponse(choice);
    }

    throw new Error("OpenRouter: max retries exceeded");
  }

  private buildMessages(params: ChatParams): OpenRouterMessage[] {
    const messages: OpenRouterMessage[] = [];

    if (params.system) {
      messages.push({ role: "system", content: params.system });
    }

    for (const msg of params.messages) {
      if (msg.role === "user") {
        if (typeof msg.content === "string") {
          messages.push({ role: "user", content: msg.content });
        } else {
          for (const result of msg.content as ToolResultBlock[]) {
            messages.push({
              role: "tool",
              content: result.content,
              tool_call_id: result.toolUseId,
            });
          }
        }
      } else {
        const textParts = msg.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { text: string }).text)
          .join("");

        const toolCalls = msg.content
          .filter((b) => b.type === "tool_use")
          .map((b) => {
            const tu = b as { id: string; name: string; input: unknown };
            return {
              id: tu.id,
              type: "function" as const,
              function: {
                name: tu.name,
                arguments: JSON.stringify(tu.input),
              },
            };
          });

        const assistantMsg: OpenRouterMessage = {
          role: "assistant",
          content: textParts || null,
        };
        if (toolCalls.length > 0) {
          assistantMsg.tool_calls = toolCalls;
        }
        messages.push(assistantMsg);
      }
    }

    return messages;
  }

  private parseResponse(
    choice: NonNullable<OpenRouterResponse["choices"]>[0],
  ): ChatResponse {
    const content: ContentBlock[] = [];

    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        });
      }
    }

    const stopReason =
      choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";

    return { content, stopReason };
  }
}
