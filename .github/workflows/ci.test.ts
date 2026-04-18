import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

const workflowPath = join(import.meta.dir, "ci.yml");

describe("CI workflow (ci.yml)", () => {
  it("file exists", () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it("parses as valid YAML", () => {
    const content = readFileSync(workflowPath, "utf-8");
    expect(() => parse(content)).not.toThrow();
  });

  it("triggers on push to main", () => {
    const workflow = parse(readFileSync(workflowPath, "utf-8"));
    expect(workflow.on.push.branches).toContain("main");
  });

  it("triggers on pull_request", () => {
    const workflow = parse(readFileSync(workflowPath, "utf-8"));
    expect(workflow.on.pull_request).toBeDefined();
  });

  it("uses oven-sh/setup-bun action", () => {
    const content = readFileSync(workflowPath, "utf-8");
    expect(content).toContain("oven-sh/setup-bun");
  });

  it("installs dependencies with bun install", () => {
    const content = readFileSync(workflowPath, "utf-8");
    expect(content).toContain("bun install");
  });

  it("runs lint", () => {
    const content = readFileSync(workflowPath, "utf-8");
    expect(content).toContain("bun run lint");
  });

  it("runs format check", () => {
    const content = readFileSync(workflowPath, "utf-8");
    expect(content).toContain("bun run format:check");
  });

  it("runs tests", () => {
    const content = readFileSync(workflowPath, "utf-8");
    expect(content).toContain("bun test");
  });
});
