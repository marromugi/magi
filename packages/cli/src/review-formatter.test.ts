import { describe, test, expect } from "bun:test";
import { formatReviewAsMarkdown, type ReviewRunData } from "./review-formatter";

const base: ReviewRunData = {
  schedule_id: 1,
  cron_expr: "0 9 * * *",
  branch: "main",
  prompt: "Review for security issues",
  since: null,
  commits: [],
};

describe("formatReviewAsMarkdown", () => {
  test("includes schedule id and branch", () => {
    const md = formatReviewAsMarkdown(base);
    expect(md).toContain("Schedule #1");
    expect(md).toContain("main");
  });

  test("includes cron expression", () => {
    const md = formatReviewAsMarkdown(base);
    expect(md).toContain("0 9 * * *");
  });

  test("shows 'all time' when since is null", () => {
    const md = formatReviewAsMarkdown(base);
    expect(md).toContain("all time");
  });

  test("shows since date when provided", () => {
    const md = formatReviewAsMarkdown({
      ...base,
      since: "2024-01-01 00:00:00",
    });
    expect(md).toContain("2024-01-01 00:00:00");
    expect(md).not.toContain("all time");
  });

  test("includes prompt content", () => {
    const md = formatReviewAsMarkdown(base);
    expect(md).toContain("Review for security issues");
  });

  test("shows no-commits message when commits is empty", () => {
    const md = formatReviewAsMarkdown(base);
    expect(md).toContain("No commits");
  });

  test("renders commit table with headers when commits exist", () => {
    const md = formatReviewAsMarkdown({
      ...base,
      commits: [
        {
          hash: "abc1234567890",
          author: "Alice",
          date: "2024-01-01 10:00:00 +0900",
          subject: "Fix bug",
        },
      ],
    });
    expect(md).toContain("| Hash |");
    expect(md).toContain("| Author |");
    expect(md).toContain("| Date |");
    expect(md).toContain("| Subject |");
  });

  test("truncates commit hash to 7 characters", () => {
    const md = formatReviewAsMarkdown({
      ...base,
      commits: [
        {
          hash: "abc1234567890",
          author: "Alice",
          date: "2024-01-01",
          subject: "Fix bug",
        },
      ],
    });
    expect(md).toContain("abc1234");
    expect(md).not.toContain("abc12345678");
  });

  test("includes author and subject in commit row", () => {
    const md = formatReviewAsMarkdown({
      ...base,
      commits: [
        {
          hash: "abc1234567890",
          author: "Bob",
          date: "2024-01-01",
          subject: "Add feature",
        },
      ],
    });
    expect(md).toContain("Bob");
    expect(md).toContain("Add feature");
  });

  test("is valid markdown with h2 heading", () => {
    const md = formatReviewAsMarkdown(base);
    expect(md).toMatch(/^## Review:/);
  });
});
