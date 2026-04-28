import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { SQLiteDatabase } from "./sqlite";
import type { DeviceRecord } from "../types";

describe("SQLiteDatabase", () => {
  let tempDir: string;
  let db: SQLiteDatabase;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "magi-db-"));
    db = new SQLiteDatabase(join(tempDir, "test.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(tempDir, { recursive: true });
  });

  describe("devices", () => {
    const device: DeviceRecord = {
      id: "d1",
      name: "test-device",
      tokenHash: "abc123hash",
      status: "paired",
      scopes: ["read"],
      createdAt: "2026-01-01T00:00:00Z",
      pairedAt: "2026-01-01T00:00:00Z",
    };

    it("inserts and finds by id", async () => {
      await db.devices.insert(device);
      const found = await db.devices.findById("d1");
      expect(found).not.toBeNull();
      expect(found!.name).toBe("test-device");
      expect(found!.scopes).toEqual(["read"]);
    });

    it("returns null for missing id", async () => {
      const found = await db.devices.findById("nonexistent");
      expect(found).toBeNull();
    });

    it("finds by token hash", async () => {
      await db.devices.insert(device);
      const found = await db.devices.findByTokenHash("abc123hash");
      expect(found).not.toBeNull();
      expect(found!.id).toBe("d1");
    });

    it("returns null for missing token hash", async () => {
      const found = await db.devices.findByTokenHash("unknown");
      expect(found).toBeNull();
    });

    it("updates status", async () => {
      await db.devices.insert(device);
      await db.devices.updateStatus("d1", "revoked");
      const found = await db.devices.findById("d1");
      expect(found!.status).toBe("revoked");
    });

    it("lists all devices", async () => {
      await db.devices.insert(device);
      await db.devices.insert({
        ...device,
        id: "d2",
        name: "second",
        tokenHash: "def456hash",
      });
      const all = await db.devices.list();
      expect(all).toHaveLength(2);
    });

    it("deletes a device", async () => {
      await db.devices.insert(device);
      await db.devices.delete("d1");
      const found = await db.devices.findById("d1");
      expect(found).toBeNull();
    });

    it("list excludes revoked by default", async () => {
      await db.devices.insert(device);
      await db.devices.insert({
        ...device,
        id: "d2",
        name: "revoked-device",
        tokenHash: "xyz",
        status: "revoked",
      });
      const active = await db.devices.list();
      expect(active).toHaveLength(1);
      expect(active[0]!.name).toBe("test-device");
    });
  });

  describe("sessions", () => {
    it("inserts and finds by id", async () => {
      await db.sessions.insert({
        id: "s1",
        status: "running",
        systemPrompt: "You are helpful",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });

      const found = await db.sessions.findById("s1");
      expect(found).not.toBeNull();
      expect(found!.status).toBe("running");
      expect(found!.systemPrompt).toBe("You are helpful");
    });

    it("returns null for missing id", async () => {
      const found = await db.sessions.findById("nonexistent");
      expect(found).toBeNull();
    });

    it("updates status", async () => {
      await db.sessions.insert({
        id: "s1",
        status: "running",
        systemPrompt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });

      await db.sessions.updateStatus("s1", "completed");
      const found = await db.sessions.findById("s1");
      expect(found!.status).toBe("completed");
    });

    it("lists sessions", async () => {
      await db.sessions.insert({
        id: "s1",
        status: "completed",
        systemPrompt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });
      await db.sessions.insert({
        id: "s2",
        status: "running",
        systemPrompt: null,
        createdAt: "2026-01-02T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      });

      const all = await db.sessions.list();
      expect(all).toHaveLength(2);
    });
  });

  describe("steps", () => {
    it("inserts and lists by session id", async () => {
      await db.sessions.insert({
        id: "s1",
        status: "running",
        systemPrompt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      });

      await db.steps.insert({
        sessionId: "s1",
        type: "user_message",
        toolName: null,
        toolInput: null,
        content: "Hello",
        createdAt: "2026-01-01T00:00:01Z",
      });

      await db.steps.insert({
        sessionId: "s1",
        type: "tool_call",
        toolName: "exec",
        toolInput: JSON.stringify({ command: "echo", args: ["hi"] }),
        content: 'exec({"command":"echo","args":["hi"]})',
        createdAt: "2026-01-01T00:00:02Z",
      });

      await db.steps.insert({
        sessionId: "s1",
        type: "tool_result",
        toolName: "exec",
        toolInput: null,
        content: "hi",
        createdAt: "2026-01-01T00:00:03Z",
      });

      const steps = await db.steps.listBySessionId("s1");
      expect(steps).toHaveLength(3);
      expect(steps[0]!.type).toBe("user_message");
      expect(steps[1]!.type).toBe("tool_call");
      expect(steps[2]!.type).toBe("tool_result");
      expect(steps[1]!.toolName).toBe("exec");
    });

    it("returns empty for unknown session", async () => {
      const steps = await db.steps.listBySessionId("nonexistent");
      expect(steps).toEqual([]);
    });

    it("isolates steps between sessions", async () => {
      for (const id of ["s1", "s2"]) {
        await db.sessions.insert({
          id,
          status: "running",
          systemPrompt: null,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        });
      }

      await db.steps.insert({
        sessionId: "s1",
        type: "text",
        toolName: null,
        toolInput: null,
        content: "from s1",
        createdAt: "2026-01-01T00:00:01Z",
      });
      await db.steps.insert({
        sessionId: "s2",
        type: "text",
        toolName: null,
        toolInput: null,
        content: "from s2",
        createdAt: "2026-01-01T00:00:01Z",
      });

      const s1Steps = await db.steps.listBySessionId("s1");
      expect(s1Steps).toHaveLength(1);
      expect(s1Steps[0]!.content).toBe("from s1");
    });
  });

  describe("secrets", () => {
    it("inserts and finds by name", async () => {
      await db.secrets.insert({
        name: "TWITTER_API_KEY",
        value: "sk-real-secret",
        placeholder: "magi_s_abc123",
        createdAt: "2026-01-01T00:00:00Z",
      });

      const found = await db.secrets.findByName("TWITTER_API_KEY");
      expect(found).not.toBeNull();
      expect(found!.value).toBe("sk-real-secret");
      expect(found!.placeholder).toBe("magi_s_abc123");
    });

    it("returns null for missing name", async () => {
      const found = await db.secrets.findByName("NONEXISTENT");
      expect(found).toBeNull();
    });

    it("finds by placeholder", async () => {
      await db.secrets.insert({
        name: "MY_KEY",
        value: "real-value",
        placeholder: "magi_s_xyz789",
        createdAt: "2026-01-01T00:00:00Z",
      });

      const found = await db.secrets.findByPlaceholder("magi_s_xyz789");
      expect(found).not.toBeNull();
      expect(found!.name).toBe("MY_KEY");
    });

    it("lists all secrets", async () => {
      await db.secrets.insert({
        name: "KEY_A",
        value: "val-a",
        placeholder: "magi_s_aaa",
        createdAt: "2026-01-01T00:00:00Z",
      });
      await db.secrets.insert({
        name: "KEY_B",
        value: "val-b",
        placeholder: "magi_s_bbb",
        createdAt: "2026-01-01T00:00:00Z",
      });

      const all = await db.secrets.list();
      expect(all).toHaveLength(2);
    });

    it("deletes a secret", async () => {
      await db.secrets.insert({
        name: "TO_DELETE",
        value: "val",
        placeholder: "magi_s_del",
        createdAt: "2026-01-01T00:00:00Z",
      });
      await db.secrets.delete("TO_DELETE");
      const found = await db.secrets.findByName("TO_DELETE");
      expect(found).toBeNull();
    });
  });
});
