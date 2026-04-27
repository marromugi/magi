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
});
