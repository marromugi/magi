import { describe, it, expect } from "bun:test";
import {
  VERIFY_JSON_SCHEMA,
  buildVerifyPrompt,
  buildReimplementPrompt,
} from "./verification.js";
import type { VerifyJudgment } from "./verification.js";

describe("VERIFY_JSON_SCHEMA", () => {
  it("is a valid JSON schema object with required fields", () => {
    expect(VERIFY_JSON_SCHEMA.type).toBe("object");
    expect(VERIFY_JSON_SCHEMA.required).toEqual([
      "pass",
      "summary",
      "failures",
    ]);
    expect(VERIFY_JSON_SCHEMA.properties.pass.type).toBe("boolean");
    expect(VERIFY_JSON_SCHEMA.properties.summary.type).toBe("string");
    expect(VERIFY_JSON_SCHEMA.properties.failures.type).toBe("array");
    expect(VERIFY_JSON_SCHEMA.properties.failures.items.type).toBe("string");
  });
});

describe("buildVerifyPrompt", () => {
  it("returns a string containing the issue prompt", () => {
    const prompt = buildVerifyPrompt("Fix bug in parser", 1);
    expect(prompt).toContain("Fix bug in parser");
  });

  it("includes attempt number", () => {
    const prompt = buildVerifyPrompt("Fix bug", 2);
    expect(prompt).toContain("2");
  });

  it("instructs to run bun test", () => {
    const prompt = buildVerifyPrompt("Some task", 1);
    expect(prompt).toContain("bun test");
  });

  it("instructs to review code changes", () => {
    const prompt = buildVerifyPrompt("Some task", 1);
    expect(prompt).toContain("review");
  });

  it("instructs to judge if root cause is resolved", () => {
    const prompt = buildVerifyPrompt("Some task", 1);
    expect(prompt).toMatch(/resolve|root cause/i);
  });
});

describe("buildReimplementPrompt", () => {
  const feedback: VerifyJudgment = {
    pass: false,
    summary: "Tests failed in parser module",
    failures: ["parser.test.ts: expected 3 but got 2", "edge case not handled"],
  };

  it("includes the original prompt", () => {
    const prompt = buildReimplementPrompt("Fix parser bug", feedback);
    expect(prompt).toContain("Fix parser bug");
  });

  it("includes the verification summary", () => {
    const prompt = buildReimplementPrompt("Fix parser bug", feedback);
    expect(prompt).toContain("Tests failed in parser module");
  });

  it("includes each failure from the feedback", () => {
    const prompt = buildReimplementPrompt("Fix parser bug", feedback);
    expect(prompt).toContain("parser.test.ts: expected 3 but got 2");
    expect(prompt).toContain("edge case not handled");
  });

  it("instructs to address the specific gaps", () => {
    const prompt = buildReimplementPrompt("Fix parser bug", feedback);
    expect(prompt).toMatch(/address|fix|resolve/i);
  });
});
