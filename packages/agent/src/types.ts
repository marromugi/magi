import type { LLMProvider } from "./llm";

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolResult {
  output: string;
  isError?: boolean;
}

export interface AgentConfig {
  llm: LLMProvider;
  model: string;
  tools?: Tool[];
  systemPrompt?: string;
  maxSteps?: number;
}

export type StepType = "tool_call" | "tool_result" | "text";

export interface AgentStep {
  type: StepType;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  content: string;
}
