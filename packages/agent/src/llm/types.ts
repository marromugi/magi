export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatParams {
  model: string;
  system?: string;
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
}

export type Message = UserMessage | AssistantMessage;

export interface UserMessage {
  role: "user";
  content: string | ToolResultBlock[];
}

export interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];
}

export type ContentBlock = TextBlock | ToolUseBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens";

export interface ChatResponse {
  content: ContentBlock[];
  stopReason: StopReason;
}

export interface LLMProvider {
  readonly name: string;
  chat(params: ChatParams): Promise<ChatResponse>;
}
