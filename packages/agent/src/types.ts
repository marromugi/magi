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

export type StepType = "user_message" | "tool_call" | "tool_result" | "text";

export interface AgentStep {
  type: StepType;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  content: string;
}

export interface SessionLogger {
  logStep(step: AgentStep): Promise<void>;
  complete(): Promise<void>;
  fail(error: string): Promise<void>;
}

export interface AgentConfig {
  llm: LLMProvider;
  model: string;
  tools?: Tool[];
  systemPrompt?: string;
  maxSteps?: number;
  session?: SessionLogger;
}
