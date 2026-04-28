import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  Agent,
  createSandboxTools,
  createTaskTool,
  createSessionLogger,
} from "@magi/agent";
import type { LLMProvider } from "@magi/agent";
import type { Env, Device } from "../types";

const run = new Hono<{
  Bindings: Env;
  Variables: { device: Device };
}>();

run.post("/", async (c) => {
  if (!c.env.sandbox) {
    return c.json({ error: "Sandbox not available" }, 503);
  }

  const body = await c.req.json<{
    task?: string;
    model?: string;
    systemPrompt?: string;
    maxSteps?: number;
    llmProvider?: LLMProvider;
  }>();

  if (!body.task) {
    return c.json({ error: "task is required" }, 400);
  }

  // LLM provider must be passed via env (set by serve command)
  const llm =
    body.llmProvider ?? (c.env as unknown as { llm?: LLMProvider }).llm;
  if (!llm) {
    return c.json({ error: "LLM provider not configured" }, 503);
  }

  const sandbox = c.env.sandbox;
  const sessionId = crypto.randomUUID();

  // Clean workspace
  await sandbox.exec("sh", ["-c", "rm -rf /workspace && mkdir -p /workspace"]);

  // Load secrets for exec env
  const secrets = await c.env.secretRepository.list();
  const secretEnv: Record<string, string> = {};
  for (const s of secrets) {
    secretEnv[s.name] = s.placeholder;
  }

  const session = createSessionLogger(sessionId, {
    sessions: c.env.sessionRepository,
    steps: c.env.stepRepository,
  });

  const sandboxTools = createSandboxTools(sandbox, {
    env: secretEnv,
  });
  const agentConfig = {
    llm,
    model: body.model ?? "claude-sonnet-4-20250514",
    tools: sandboxTools,
    systemPrompt: body.systemPrompt,
    maxSteps: body.maxSteps ?? 50,
    session,
  };
  agentConfig.tools = [...sandboxTools, createTaskTool(agentConfig)];

  const agent = new Agent(agentConfig);

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "session",
      data: JSON.stringify({ sessionId }),
    });

    for await (const step of agent.run(body.task!)) {
      await stream.writeSSE({
        event: step.type,
        data: JSON.stringify(step),
      });
    }

    await stream.writeSSE({
      event: "done",
      data: JSON.stringify({ sessionId }),
    });
  });
});

export { run };
