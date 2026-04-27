import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { FilesystemStorageProvider } from "./filesystem";

describe("FilesystemStorageProvider", () => {
  let tempDir: string;
  let storage: FilesystemStorageProvider;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "magi-fs-"));
    storage = new FilesystemStorageProvider(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("returns null for missing file", async () => {
    const result = await storage.read("missing.txt");
    expect(result).toBeNull();
  });

  it("writes and reads a string file", async () => {
    await storage.write("hello.txt", "world");
    const result = await storage.read("hello.txt");
    expect(result!.toString()).toBe("world");
  });

  it("writes and reads a binary file", async () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await storage.write("image.png", data);
    const result = await storage.read("image.png");
    expect(result).toEqual(data);
  });

  it("overwrites existing file", async () => {
    await storage.write("file.txt", "first");
    await storage.write("file.txt", "second");
    const result = await storage.read("file.txt");
    expect(result!.toString()).toBe("second");
  });

  it("deletes a file", async () => {
    await storage.write("file.txt", "data");
    await storage.delete("file.txt");
    expect(await storage.exists("file.txt")).toBe(false);
  });

  it("delete on missing file does not throw", async () => {
    await storage.delete("nonexistent.txt");
  });

  it("checks file existence", async () => {
    expect(await storage.exists("file.txt")).toBe(false);
    await storage.write("file.txt", "data");
    expect(await storage.exists("file.txt")).toBe(true);
  });

  it("lists files with prefix", async () => {
    await storage.write("docs/a.md", "a");
    await storage.write("docs/b.md", "b");
    await storage.write("images/c.png", "c");

    const docs = await storage.list("docs/");
    expect(docs.sort()).toEqual(["docs/a.md", "docs/b.md"]);

    const all = await storage.list();
    expect(all.sort()).toEqual(["docs/a.md", "docs/b.md", "images/c.png"]);
  });

  it("handles nested directories", async () => {
    await storage.write("a/b/c/deep.txt", "nested");
    const result = await storage.read("a/b/c/deep.txt");
    expect(result!.toString()).toBe("nested");
  });
});
