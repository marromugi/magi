import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { resolve } from "path";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "fs";
import { tmpdir } from "os";

const FIREWALL_SCRIPT = resolve(import.meta.dir, "..", "init-firewall.sh");

let tmpDir: string;

function makeFailing(dir: string, name: string) {
  const path = `${dir}/${name}`;
  writeFileSync(
    path,
    '#!/bin/bash\necho "${0##*/}: Operation not permitted" >&2\nexit 1\n',
  );
  chmodSync(path, 0o755);
}

beforeAll(() => {
  tmpDir = mkdtempSync(`${tmpdir()}/firewall-test-`);
  for (const tool of [
    "iptables",
    "iptables-save",
    "ipset",
    "ip",
    "curl",
    "dig",
    "aggregate",
    "jq",
    "gh",
  ]) {
    makeFailing(tmpDir, tool);
  }
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function runFirewall(): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const proc = Bun.spawn(["bash", FIREWALL_SCRIPT], {
    env: { PATH: `${tmpDir}:/usr/bin:/bin` },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe("init-firewall.sh graceful failure", () => {
  it("exits 0 when iptables is unavailable (no NET_ADMIN)", async () => {
    const { exitCode } = await runFirewall();
    expect(exitCode).toBe(0);
  });

  it("outputs WARNING when iptables is unavailable", async () => {
    const { stdout } = await runFirewall();
    expect(stdout).toMatch(/WARNING/);
  });

  it("outputs skip message when iptables is unavailable", async () => {
    const { stdout } = await runFirewall();
    expect(stdout).toMatch(/[Ss]kip/);
  });
});
