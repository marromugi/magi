import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { FilesystemStorage } from "./filesystem";

describe("FilesystemStorage", () => {
  let tempDir: string;
  let storage: FilesystemStorage;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "magi-storage-"));
    storage = new FilesystemStorage(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("returns null for missing key", async () => {
    const result = await storage.get("nonexistent");
    expect(result).toBeNull();
  });

  it("puts and gets a value", async () => {
    await storage.put("key1", "value1");
    const result = await storage.get("key1");
    expect(result).toBe("value1");
  });

  it("overwrites existing value", async () => {
    await storage.put("key1", "first");
    await storage.put("key1", "second");
    expect(await storage.get("key1")).toBe("second");
  });

  it("deletes a value", async () => {
    await storage.put("key1", "value1");
    await storage.delete("key1");
    expect(await storage.get("key1")).toBeNull();
  });

  it("delete on missing key does not throw", async () => {
    await storage.delete("nonexistent");
  });

  it("lists keys with prefix", async () => {
    await storage.put("device:a", "1");
    await storage.put("device:b", "2");
    await storage.put("token:x", "3");

    const deviceKeys = await storage.list("device:");
    expect(deviceKeys.sort()).toEqual(["device:a", "device:b"]);

    const allKeys = await storage.list();
    expect(allKeys.sort()).toEqual(["device:a", "device:b", "token:x"]);
  });

  it("handles keys with special characters", async () => {
    await storage.put("pair:abc-123", "data");
    expect(await storage.get("pair:abc-123")).toBe("data");
  });

  it("expires values after TTL", async () => {
    await storage.put("ephemeral", "data", { expirationTtl: 1 });
    expect(await storage.get("ephemeral")).toBe("data");

    await new Promise((r) => setTimeout(r, 1100));
    expect(await storage.get("ephemeral")).toBeNull();
  });
});
