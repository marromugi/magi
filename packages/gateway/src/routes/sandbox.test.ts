import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { FilesystemStorage } from "@magi/kv/providers/filesystem";
import { SQLiteDatabase } from "@magi/db/providers/sqlite";
import { DeviceStore } from "@magi/auth";
import { DockerSandboxProvider } from "@magi/sandbox/providers/docker";
import type { Sandbox } from "@magi/sandbox";
import app from "../index";
import type { Env } from "../types";

const ADMIN_KEY = "test-admin-key";
const provider = new DockerSandboxProvider({ prefix: "magi-gw-test" });

let tempDir: string;
let db: SQLiteDatabase;
let sandbox: Sandbox;
let env: Env;
let deviceToken: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "magi-gw-sb-"));
  db = new SQLiteDatabase(join(tempDir, "test.db"));
  const kv = new FilesystemStorage(join(tempDir, "kv"));

  sandbox = await provider.create({
    name: `sb-${Date.now()}`,
    image: "alpine:latest",
  });
  await sandbox.start();

  env = {
    ADMIN_API_KEY: ADMIN_KEY,
    kv,
    deviceRepository: db.devices,
    sessionRepository: db.sessions,
    stepRepository: db.steps,
    secretRepository: db.secrets,
    sandbox,
  };

  // Create a paired device
  const store = new DeviceStore({ kv, devices: db.devices });
  const invite = await store.createInvite({ ttlMs: 60_000 });
  const result = await store.pair({
    bootstrapToken: invite.bootstrapToken,
    deviceName: "test-device",
  });
  deviceToken = result.deviceToken;
});

afterEach(async () => {
  await sandbox.stop();
  await sandbox.reset();
  db.close();
  await rm(tempDir, { recursive: true });
});

describe("POST /api/sandbox/exec", () => {
  it("executes a command in the sandbox", async () => {
    const res = await app.request(
      "/api/sandbox/exec",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deviceToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command: "echo", args: ["hello"] }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      exitCode: number;
      stdout: string;
    };
    expect(body.exitCode).toBe(0);
    expect(body.stdout.trim()).toBe("hello");
  });

  it("rejects without device auth", async () => {
    const res = await app.request(
      "/api/sandbox/exec",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "echo", args: ["hello"] }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns error when sandbox is not available", async () => {
    const noSandboxEnv = { ...env, sandbox: null };
    const res = await app.request(
      "/api/sandbox/exec",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deviceToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command: "echo", args: ["test"] }),
      },
      noSandboxEnv,
    );
    expect(res.status).toBe(503);
  });

  it("returns non-zero exit codes", async () => {
    const res = await app.request(
      "/api/sandbox/exec",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deviceToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command: "sh", args: ["-c", "exit 1"] }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { exitCode: number };
    expect(body.exitCode).toBe(1);
  });
});

describe("GET /api/sandbox/status", () => {
  it("returns sandbox status", async () => {
    const res = await app.request(
      "/api/sandbox/status",
      {
        headers: { Authorization: `Bearer ${deviceToken}` },
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("running");
  });
});

describe("POST /api/sandbox/snapshot", () => {
  it("takes a snapshot", async () => {
    const res = await app.request(
      "/api/sandbox/snapshot",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deviceToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tag: "test-snap" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tag: string; id: string };
    expect(body.tag).toBe("test-snap");
    expect(body.id).toBeTruthy();
  });
});
