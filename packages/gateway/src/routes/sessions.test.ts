import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { FilesystemStorage } from "@magi/kv/providers/filesystem";
import { SQLiteDatabase } from "@magi/db/providers/sqlite";
import { DeviceStore } from "@magi/auth";
import app from "../index";
import type { Env } from "../types";

let tempDir: string;
let db: SQLiteDatabase;
let env: Env;
let deviceToken: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "magi-gw-sess-"));
  db = new SQLiteDatabase(join(tempDir, "test.db"));
  const kv = new FilesystemStorage(join(tempDir, "kv"));
  env = {
    ADMIN_API_KEY: "test-key",
    kv,
    deviceRepository: db.devices,
    sessionRepository: db.sessions,
    stepRepository: db.steps,
    secretRepository: db.secrets,
    sandbox: null,
  };

  const store = new DeviceStore({ kv, devices: db.devices });
  const invite = await store.createInvite({ ttlMs: 60_000 });
  const result = await store.pair({
    bootstrapToken: invite.bootstrapToken,
    deviceName: "test",
  });
  deviceToken = result.deviceToken;
});

afterEach(async () => {
  db.close();
  await rm(tempDir, { recursive: true });
});

describe("GET /api/sessions", () => {
  it("returns empty list initially", async () => {
    const res = await app.request(
      "/api/sessions",
      { headers: { Authorization: `Bearer ${deviceToken}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: unknown[] };
    expect(body.sessions).toEqual([]);
  });

  it("returns sessions after creation", async () => {
    await db.sessions.insert({
      id: "s1",
      status: "completed",
      systemPrompt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await app.request(
      "/api/sessions",
      { headers: { Authorization: `Bearer ${deviceToken}` } },
      env,
    );
    const body = (await res.json()) as {
      sessions: Array<{ id: string }>;
    };
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]!.id).toBe("s1");
  });
});

describe("GET /api/sessions/:id", () => {
  it("returns session by id", async () => {
    await db.sessions.insert({
      id: "s1",
      status: "running",
      systemPrompt: "test prompt",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const res = await app.request(
      "/api/sessions/s1",
      { headers: { Authorization: `Bearer ${deviceToken}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      session: { id: string; systemPrompt: string };
    };
    expect(body.session.id).toBe("s1");
    expect(body.session.systemPrompt).toBe("test prompt");
  });

  it("returns 404 for missing session", async () => {
    const res = await app.request(
      "/api/sessions/nonexistent",
      { headers: { Authorization: `Bearer ${deviceToken}` } },
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/sessions/:id/steps", () => {
  it("returns steps for a session", async () => {
    await db.sessions.insert({
      id: "s1",
      status: "completed",
      systemPrompt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.steps.insert({
      sessionId: "s1",
      type: "user_message",
      toolName: null,
      toolInput: null,
      content: "do something",
      createdAt: new Date().toISOString(),
    });
    await db.steps.insert({
      sessionId: "s1",
      type: "text",
      toolName: null,
      toolInput: null,
      content: "done",
      createdAt: new Date().toISOString(),
    });

    const res = await app.request(
      "/api/sessions/s1/steps",
      { headers: { Authorization: `Bearer ${deviceToken}` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      steps: Array<{ type: string; content: string }>;
    };
    expect(body.steps).toHaveLength(2);
    expect(body.steps[0]!.type).toBe("user_message");
    expect(body.steps[1]!.content).toBe("done");
  });

  it("returns 404 for missing session", async () => {
    const res = await app.request(
      "/api/sessions/nonexistent/steps",
      { headers: { Authorization: `Bearer ${deviceToken}` } },
      env,
    );
    expect(res.status).toBe(404);
  });
});
