import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readConfig, writeConfig, type Config } from "./config";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("config", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "magi-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("returns default config when file does not exist", async () => {
    const config = await readConfig(join(tempDir, "config.json"));
    expect(config).toEqual({
      workerUrl: "",
      adminApiKey: "",
      anthropicApiKey: "",
      model: "claude-sonnet-4-20250514",
    });
  });

  it("writes and reads config", async () => {
    const path = join(tempDir, "config.json");
    const config: Config = {
      workerUrl: "https://magi.workers.dev",
      adminApiKey: "admin-key",
      anthropicApiKey: "sk-ant-xxx",
      model: "claude-sonnet-4-20250514",
    };
    await writeConfig(path, config);
    const loaded = await readConfig(path);
    expect(loaded).toEqual(config);
  });
});
