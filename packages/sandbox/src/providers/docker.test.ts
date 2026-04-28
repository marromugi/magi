import { describe, it, expect, afterAll, setDefaultTimeout } from "bun:test";

setDefaultTimeout(30_000);
import { DockerSandboxProvider } from "./docker";

const provider = new DockerSandboxProvider({ prefix: "magi-test" });

// Cleanup all test containers after tests
afterAll(async () => {
  const sandboxes = await provider.list();
  for (const sb of sandboxes) {
    try {
      await sb.stop();
    } catch {
      // ignore
    }
  }
  // Remove test containers
  const { execSync } = await import("child_process");
  try {
    execSync(
      'docker ps -aq --filter "name=magi-test-" | xargs -r docker rm -f',
      {
        stdio: "ignore",
      },
    );
  } catch {
    // ignore
  }
});

describe("DockerSandboxProvider", () => {
  it("creates and starts a sandbox", async () => {
    const sandbox = await provider.create({
      name: "create-test",
      image: "alpine:latest",
    });

    expect(sandbox.id).toBe("create-test");
    expect(await sandbox.status()).toBe("stopped");

    await sandbox.start();
    expect(await sandbox.status()).toBe("running");

    await sandbox.stop();
    expect(await sandbox.status()).toBe("stopped");
  });

  it("executes a command", async () => {
    const sandbox = await provider.create({
      name: "exec-test",
      image: "alpine:latest",
    });
    await sandbox.start();

    const result = await sandbox.exec("echo", ["hello world"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello world");

    await sandbox.stop();
  });

  it("returns non-zero exit code on failure", async () => {
    const sandbox = await provider.create({
      name: "fail-test",
      image: "alpine:latest",
    });
    await sandbox.start();

    const result = await sandbox.exec("sh", ["-c", "exit 42"]);
    expect(result.exitCode).toBe(42);

    await sandbox.stop();
  });

  it("preserves state across stop/start", async () => {
    const sandbox = await provider.create({
      name: "persist-test",
      image: "alpine:latest",
    });
    await sandbox.start();

    await sandbox.exec("sh", ["-c", "echo persisted > /tmp/state.txt"]);
    await sandbox.stop();
    await sandbox.start();

    const result = await sandbox.exec("cat", ["/tmp/state.txt"]);
    expect(result.stdout.trim()).toBe("persisted");

    await sandbox.stop();
  });

  it("resets sandbox to clean state", async () => {
    const sandbox = await provider.create({
      name: "reset-test",
      image: "alpine:latest",
    });
    await sandbox.start();

    await sandbox.exec("sh", ["-c", "echo data > /tmp/state.txt"]);
    await sandbox.reset();
    await sandbox.start();

    const result = await sandbox.exec("cat", ["/tmp/state.txt"]);
    expect(result.exitCode).not.toBe(0);

    await sandbox.stop();
  });

  it("takes and restores snapshots", async () => {
    const sandbox = await provider.create({
      name: "snapshot-test",
      image: "alpine:latest",
    });
    await sandbox.start();

    // Install something, take snapshot
    await sandbox.exec("sh", ["-c", "echo v1 > /tmp/version.txt"]);
    const snap = await sandbox.snapshot("v1");
    expect(snap.tag).toBe("v1");

    // Modify state
    await sandbox.exec("sh", ["-c", "echo v2 > /tmp/version.txt"]);

    // Restore snapshot
    await sandbox.restore("v1");
    await sandbox.start();

    const result = await sandbox.exec("cat", ["/tmp/version.txt"]);
    expect(result.stdout.trim()).toBe("v1");

    await sandbox.stop();

    // List snapshots
    const snaps = await provider.snapshots("snapshot-test");
    expect(snaps.length).toBeGreaterThanOrEqual(1);
  });

  it("passes environment variables", async () => {
    const sandbox = await provider.create({
      name: "env-test",
      image: "alpine:latest",
      env: { MY_VAR: "hello" },
    });
    await sandbox.start();

    const result = await sandbox.exec("sh", ["-c", "echo $MY_VAR"]);
    expect(result.stdout.trim()).toBe("hello");

    await sandbox.stop();
  });

  it("lists sandboxes", async () => {
    const all = await provider.list();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it("gets sandbox by id", async () => {
    const found = await provider.get("exec-test");
    expect(found).not.toBeNull();

    const missing = await provider.get("nonexistent-xyz");
    expect(missing).toBeNull();
  });
});
