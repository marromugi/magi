import type { SessionRepository, StepRepository } from "@magi/db";
import type { SessionLogger, AgentStep } from "./types";

export interface DbSessionLoggerDeps {
  sessions: SessionRepository;
  steps: StepRepository;
}

export function createSessionLogger(
  sessionId: string,
  deps: DbSessionLoggerDeps,
  systemPrompt?: string,
): SessionLogger {
  let initialized = false;

  async function ensureSession() {
    if (initialized) return;
    await deps.sessions.insert({
      id: sessionId,
      status: "running",
      systemPrompt: systemPrompt ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    initialized = true;
  }

  return {
    async logStep(step: AgentStep) {
      await ensureSession();
      await deps.steps.insert({
        sessionId,
        type: step.type,
        toolName: step.toolName ?? null,
        toolInput: step.toolInput ? JSON.stringify(step.toolInput) : null,
        content: step.content,
        createdAt: new Date().toISOString(),
      });
    },

    async complete() {
      await ensureSession();
      await deps.sessions.updateStatus(sessionId, "completed");
    },

    async fail() {
      await ensureSession();
      await deps.sessions.updateStatus(sessionId, "failed");
    },
  };
}
