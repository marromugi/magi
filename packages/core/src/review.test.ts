import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { closeDb, migrate } from "./db.js";
import {
  generateWorkflow,
  createReviewSchedule,
  getReviewSchedule,
  updateReviewSchedule,
  runReview,
  type ReviewSchedule,
  type CommitInfo,
} from "./review.js";

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

describe("runReview", () => {
  let tmpDir: string;
  let dbPath: string;
  let scheduleId: number;

  beforeEach(async () => {
    closeDb();
    tmpDir = await mkdtemp(join(tmpdir(), "magi-review-test-"));
    dbPath = join(tmpDir, "test.db");
    migrate(dbPath);

    const schedule = createReviewSchedule(dbPath, {
      cron_expr: "0 0 * * *",
      branch: "main",
      prompt: "",
    });
    scheduleId = schedule.id;
  });

  afterEach(async () => {
    closeDb();
    await rm(tmpDir, { recursive: true });
  });

  const fakeCommits: CommitInfo[] = [
    {
      hash: "abc123",
      author: "Alice",
      date: "2024-01-02 00:00:00",
      subject: "feat: add feature",
    },
  ];

  it("skips when there are no commits", async () => {
    const gitLog = mock(() => [] as CommitInfo[]);
    const gitDiff = mock(() => "");
    const claude = mock(async () => "review comment");

    const schedule = getReviewSchedule(dbPath, scheduleId)!;
    const result = await runReview(
      { dbPath, repoPath: "/repo", schedule },
      { gitLog, gitDiff, claude },
    );

    expect(result.skipped).toBe(true);
    expect(result.comment).toBeNull();
    expect(claude).not.toHaveBeenCalled();
  });

  it("calls gitLog with branch and last_reviewed_at", async () => {
    const gitLog = mock(() => fakeCommits);
    const gitDiff = mock(() => "diff content");
    const claude = mock(async () => "review comment");

    const schedule = updateReviewSchedule(dbPath, scheduleId, {
      last_reviewed_at: "2024-01-01 00:00:00",
    })!;

    await runReview(
      { dbPath, repoPath: "/repo", schedule },
      { gitLog, gitDiff, claude },
    );

    expect(gitLog).toHaveBeenCalledWith("/repo", "main", "2024-01-01 00:00:00");
  });

  it("calls gitLog with null when last_reviewed_at is null", async () => {
    const gitLog = mock(() => fakeCommits);
    const gitDiff = mock(() => "diff content");
    const claude = mock(async () => "review comment");

    const schedule = getReviewSchedule(dbPath, scheduleId)!;

    await runReview(
      { dbPath, repoPath: "/repo", schedule },
      { gitLog, gitDiff, claude },
    );

    expect(gitLog).toHaveBeenCalledWith("/repo", "main", null);
  });

  it("calls gitDiff with branch and last_reviewed_at", async () => {
    const gitLog = mock(() => fakeCommits);
    const gitDiff = mock(() => "diff content");
    const claude = mock(async () => "review comment");

    const schedule = updateReviewSchedule(dbPath, scheduleId, {
      last_reviewed_at: "2024-01-01 00:00:00",
    })!;

    await runReview(
      { dbPath, repoPath: "/repo", schedule },
      { gitLog, gitDiff, claude },
    );

    expect(gitDiff).toHaveBeenCalledWith(
      "/repo",
      "main",
      "2024-01-01 00:00:00",
    );
  });

  it("passes commits, diff, and prompt to claude", async () => {
    const gitLog = mock(() => fakeCommits);
    const gitDiff = mock(() => "diff content");
    const claude = mock(async () => "review comment");

    const schedule = getReviewSchedule(dbPath, scheduleId)!;

    await runReview(
      { dbPath, repoPath: "/repo", schedule },
      { gitLog, gitDiff, claude },
    );

    expect(claude).toHaveBeenCalledWith(fakeCommits, "diff content", "");
  });

  it("passes schedule prompt to claude", async () => {
    const gitLog = mock(() => fakeCommits);
    const gitDiff = mock(() => "diff content");
    const claude = mock(async () => "review comment");

    const schedule = updateReviewSchedule(dbPath, scheduleId, {
      prompt: "Focus on security issues",
    })!;

    await runReview(
      { dbPath, repoPath: "/repo", schedule },
      { gitLog, gitDiff, claude },
    );

    expect(claude).toHaveBeenCalledWith(
      fakeCommits,
      "diff content",
      "Focus on security issues",
    );
  });

  it("returns the review comment from claude", async () => {
    const gitLog = mock(() => fakeCommits);
    const gitDiff = mock(() => "diff content");
    const claude = mock(async () => "this is the review comment");

    const schedule = getReviewSchedule(dbPath, scheduleId)!;

    const result = await runReview(
      { dbPath, repoPath: "/repo", schedule },
      { gitLog, gitDiff, claude },
    );

    expect(result.skipped).toBe(false);
    expect(result.comment).toBe("this is the review comment");
  });

  it("updates last_reviewed_at after successful review", async () => {
    const gitLog = mock(() => fakeCommits);
    const gitDiff = mock(() => "diff content");
    const claude = mock(async () => "review comment");

    const schedule = getReviewSchedule(dbPath, scheduleId)!;
    expect(schedule.last_reviewed_at).toBeNull();

    await runReview(
      { dbPath, repoPath: "/repo", schedule },
      { gitLog, gitDiff, claude },
    );

    const updated = getReviewSchedule(dbPath, scheduleId)!;
    expect(updated.last_reviewed_at).not.toBeNull();
  });

  it("does not update last_reviewed_at when skipped", async () => {
    const gitLog = mock(() => [] as CommitInfo[]);
    const gitDiff = mock(() => "");
    const claude = mock(async () => "review comment");

    const schedule = getReviewSchedule(dbPath, scheduleId)!;

    await runReview(
      { dbPath, repoPath: "/repo", schedule },
      { gitLog, gitDiff, claude },
    );

    const unchanged = getReviewSchedule(dbPath, scheduleId)!;
    expect(unchanged.last_reviewed_at).toBeNull();
  });

  it("returns scheduleId in result", async () => {
    const gitLog = mock(() => fakeCommits);
    const gitDiff = mock(() => "diff content");
    const claude = mock(async () => "review comment");

    const schedule = getReviewSchedule(dbPath, scheduleId)!;

    const result = await runReview(
      { dbPath, repoPath: "/repo", schedule },
      { gitLog, gitDiff, claude },
    );

    expect(result.scheduleId).toBe(scheduleId);
  });
});
