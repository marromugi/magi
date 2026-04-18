import { describe, it, expect } from "bun:test";
import { generateWorkflow, type ReviewSchedule } from "./review.js";

function makeSchedule(overrides: Partial<ReviewSchedule> = {}): ReviewSchedule {
  return {
    id: 1,
    cron_expr: "0 0 * * *",
    branch: "main",
    prompt: "",
    last_reviewed_at: null,
    enabled: 1,
    created_at: "2024-01-01 00:00:00",
    updated_at: "2024-01-01 00:00:00",
    ...overrides,
  };
}

describe("generateWorkflow", () => {
  it("includes the workflow name", () => {
    const yaml = generateWorkflow([makeSchedule()]);
    expect(yaml).toContain("name: MAGI Review");
  });

  it("includes cron expression for a single schedule", () => {
    const yaml = generateWorkflow([makeSchedule({ cron_expr: "0 0 * * *" })]);
    expect(yaml).toContain("cron: '0 0 * * *'");
  });

  it("includes cron expressions for multiple schedules", () => {
    const schedules = [
      makeSchedule({ id: 1, cron_expr: "0 0 * * *" }),
      makeSchedule({ id: 2, cron_expr: "0 12 * * 1" }),
    ];
    const yaml = generateWorkflow(schedules);
    expect(yaml).toContain("cron: '0 0 * * *'");
    expect(yaml).toContain("cron: '0 12 * * 1'");
  });

  it("omits schedule trigger when no schedules provided", () => {
    const yaml = generateWorkflow([]);
    expect(yaml).not.toContain("schedule:");
  });

  it("always includes workflow_dispatch trigger", () => {
    expect(generateWorkflow([])).toContain("workflow_dispatch");
    expect(generateWorkflow([makeSchedule()])).toContain("workflow_dispatch");
  });

  it("includes bun install step", () => {
    const yaml = generateWorkflow([makeSchedule()]);
    expect(yaml).toContain("bun install");
  });

  it("includes build step", () => {
    const yaml = generateWorkflow([makeSchedule()]);
    expect(yaml).toContain("bun run build");
  });

  it("includes magi review run step", () => {
    const yaml = generateWorkflow([makeSchedule()]);
    expect(yaml).toContain("magi review run");
  });

  it("includes --branch flag in review run step", () => {
    const yaml = generateWorkflow([makeSchedule({ branch: "main" })]);
    expect(yaml).toContain("--branch main");
  });

  it("includes --since flag in review run step", () => {
    const yaml = generateWorkflow([makeSchedule()]);
    expect(yaml).toContain("--since");
  });

  it("uses last_reviewed_at as since value when set", () => {
    const yaml = generateWorkflow([
      makeSchedule({ last_reviewed_at: "2024-06-01 00:00:00" }),
    ]);
    expect(yaml).toContain("2024-06-01 00:00:00");
  });

  it("uses empty string as since value when last_reviewed_at is null", () => {
    const yaml = generateWorkflow([makeSchedule({ last_reviewed_at: null })]);
    expect(yaml).toContain('--since ""');
  });
});
