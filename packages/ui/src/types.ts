export type IssueType = "feat" | "fix" | "refactor" | "chore" | "test" | "docs";
export type IssuePriority = "normal" | "interrupt";
export type IssueStatus = "queue" | "active" | "done" | "blocked";

export interface Issue {
  id: number;
  title: string;
  type: IssueType;
  priority: IssuePriority;
  status: IssueStatus;
  depends_on: string;
  affects: string;
  acceptance: string;
  context: string | null;
  branch: string | null;
  commit_message: string | null;
  worktree_path: string | null;
  created_at: string;
  updated_at: string;
}
