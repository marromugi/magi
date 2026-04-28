import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { SQLiteDatabase } from "@magi/db/providers/sqlite";
import { createSessionLogger } from "./session";
import { Agent } from "./agent";
import type { LLMProvider, ChatResponse } from "./llm";

describe("createSessionLogger", () => {
  let tempDir: string;
  let db: SQLiteDatabase;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "magi-session-"));
    db = new SQLiteDatabase(join(tempDir, "test.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(tempDir, { recursive: true });
  });

  it("logs steps to db", async () => {
    const logger = createSessionLogger("sess-1", {
      sessions: db.sessions,
      steps: db.steps,
    });

    await logger.logStep({ type: "user_message", content: "hello" });
    await logger.logStep({ type: "text", content: "hi back" });
    await logger.complete();

    const session = await db.sessions.findById("sess-1");
    expect(session).not.toBeNull();
    expect(session!.status).toBe("completed");

    const steps = await db.steps.listBySessionId("sess-1");
    expect(steps).toHaveLength(2);
    expect(steps[0]!.type).toBe("user_message");
    expect(steps[1]!.type).toBe("text");
  });

  it("logs tool calls with input", async () => {
    const logger = createSessionLogger("sess-2", {
      sessions: db.sessions,
      steps: db.steps,
    });

    await logger.logStep({
      type: "tool_call",
      toolName: "exec",
      toolInput: { command: "ls" },
      content: 'exec({"command":"ls"})',
    });
    await logger.complete();

    const steps = await db.steps.listBySessionId("sess-2");
    expect(steps).toHaveLength(1);
    expect(steps[0]!.toolName).toBe("exec");
    expect(steps[0]!.toolInput).toBe('{"command":"ls"}');
  });

  it("marks session as failed", async () => {
    const logger = createSessionLogger("sess-3", {
      sessions: db.sessions,
      steps: db.steps,
    });

    await logger.logStep({ type: "user_message", content: "do something" });
    await logger.fail("something broke");

    const session = await db.sessions.findById("sess-3");
    expect(session!.status).toBe("failed");
  });

  it("integrates with Agent loop", async () => {
    const llm: LLMProvider = {
      name: "mock",
      async chat(): Promise<ChatResponse> {
        return {
          content: [{ type: "text", text: "Done!" }],
          stopReason: "end_turn",
        };
      },
    };

    const logger = createSessionLogger("sess-4", {
      sessions: db.sessions,
      steps: db.steps,
    });

    const agent = new Agent({
      llm,
      model: "test",
      session: logger,
    });

    const steps = [];
    for await (const step of agent.run("test task")) {
      steps.push(step);
    }

    // Check DB has all steps
    const dbSteps = await db.steps.listBySessionId("sess-4");
    expect(dbSteps).toHaveLength(2); // user_message + text
    expect(dbSteps[0]!.type).toBe("user_message");
    expect(dbSteps[0]!.content).toBe("test task");
    expect(dbSteps[1]!.type).toBe("text");
    expect(dbSteps[1]!.content).toBe("Done!");

    const session = await db.sessions.findById("sess-4");
    expect(session!.status).toBe("completed");
  });
});
