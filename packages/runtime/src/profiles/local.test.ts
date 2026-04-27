import { describe, it, expect, afterEach } from "bun:test";
import { rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createLocalRuntime } from "./local";
import type { Runtime } from "../types";

const testDir = join(tmpdir(), "magi-runtime-test");
let runtime: Runtime;

afterEach(async () => {
  runtime?.db.close();
  await rm(testDir, { recursive: true, force: true });
});

describe("local runtime", () => {
  it("creates a runtime with correct name", () => {
    runtime = createLocalRuntime({ dataDir: testDir });
    expect(runtime.name).toBe("local");
  });

  it("provides a kv provider", async () => {
    runtime = createLocalRuntime({ dataDir: testDir });
    expect(runtime.kv.name).toBe("filesystem");

    await runtime.kv.put("test-key", "test-value");
    const value = await runtime.kv.get("test-key");
    expect(value).toBe("test-value");
  });

  it("provides a db provider", async () => {
    runtime = createLocalRuntime({ dataDir: testDir });
    expect(runtime.db.name).toBe("sqlite");

    await runtime.db.devices.insert({
      id: "d1",
      name: "test",
      tokenHash: "hash",
      status: "paired",
      scopes: [],
      createdAt: new Date().toISOString(),
      pairedAt: new Date().toISOString(),
    });
    const device = await runtime.db.devices.findById("d1");
    expect(device!.name).toBe("test");
  });

  it("provides a storage provider", async () => {
    runtime = createLocalRuntime({ dataDir: testDir });
    expect(runtime.storage.name).toBe("filesystem");

    await runtime.storage.write("test.txt", "hello");
    const data = await runtime.storage.read("test.txt");
    expect(data!.toString()).toBe("hello");
  });

  it("provides a sandbox provider", () => {
    runtime = createLocalRuntime({ dataDir: testDir });
    expect(runtime.sandbox.name).toBe("local");
  });
});
