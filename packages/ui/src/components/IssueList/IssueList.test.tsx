import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Issue } from "../../types";
import { IssueList } from "./IssueList";

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: 1,
  title: "Test issue",
  type: "feat",
  priority: "normal",
  status: "queue",
  depends_on: "[]",
  affects: "[]",
  acceptance: "acceptance criteria",
  context: null,
  branch: null,
  commit_message: null,
  worktree_path: null,
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
  ...overrides,
});

describe("IssueList", () => {
  it("renders table headers", () => {
    render(<IssueList issues={[makeIssue()]} />);
    expect(screen.getByText("ID")).toBeTruthy();
    expect(screen.getByText("Title")).toBeTruthy();
    expect(screen.getByText("Type")).toBeTruthy();
    expect(screen.getByText("Priority")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Depends On")).toBeTruthy();
  });

  it("renders issue data in a row", () => {
    render(
      <IssueList
        issues={[
          makeIssue({
            id: 42,
            title: "My feature",
            type: "fix",
            priority: "interrupt",
            status: "active",
          }),
        ]}
      />,
    );
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("My feature")).toBeTruthy();
    expect(screen.getByText("fix")).toBeTruthy();
    expect(screen.getByText("interrupt")).toBeTruthy();
    expect(screen.getByText("active")).toBeTruthy();
  });

  it("renders status badge with data-status attribute", () => {
    render(<IssueList issues={[makeIssue({ status: "done" })]} />);
    const badge = screen.getByTestId("status-badge");
    expect(badge.getAttribute("data-status")).toBe("done");
  });

  it("renders all status variants with distinct data-status", () => {
    const statuses = ["queue", "active", "done", "blocked"] as const;
    for (const status of statuses) {
      const { unmount } = render(
        <IssueList issues={[makeIssue({ status })]} />,
      );
      const badge = screen.getByTestId("status-badge");
      expect(badge.getAttribute("data-status")).toBe(status);
      unmount();
    }
  });

  it("renders depends_on IDs as links", () => {
    render(<IssueList issues={[makeIssue({ depends_on: "[3, 7]" })]} />);
    expect(screen.getByText("#3")).toBeTruthy();
    expect(screen.getByText("#7")).toBeTruthy();
  });

  it("renders empty depends_on as blank", () => {
    render(<IssueList issues={[makeIssue({ depends_on: "[]" })]} />);
    expect(screen.queryByText(/#\d/)).toBeNull();
  });

  it("renders empty state when no issues", () => {
    render(<IssueList issues={[]} />);
    expect(screen.getByText("No issues found.")).toBeTruthy();
  });

  it("renders multiple issues", () => {
    render(
      <IssueList
        issues={[
          makeIssue({ id: 1, title: "First" }),
          makeIssue({ id: 2, title: "Second" }),
        ]}
      />,
    );
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
  });
});
