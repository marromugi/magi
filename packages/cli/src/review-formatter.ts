export interface ReviewRunData {
  schedule_id: number;
  cron_expr: string;
  branch: string;
  prompt: string;
  since: string | null;
  commits: Array<{
    hash?: string;
    author?: string;
    date?: string;
    subject?: string;
  }>;
}

export function formatReviewAsMarkdown(data: ReviewRunData): string {
  const sinceText = data.since ?? "all time";

  const commitsSection =
    data.commits.length > 0
      ? [
          "| Hash | Author | Date | Subject |",
          "| --- | --- | --- | --- |",
          ...data.commits.map(
            (c) =>
              `| \`${c.hash?.slice(0, 7) ?? "-"}\` | ${c.author ?? "-"} | ${c.date ?? "-"} | ${c.subject ?? "-"} |`,
          ),
        ].join("\n")
      : "No commits since last review.";

  return [
    `## Review: ${data.branch} (Schedule #${data.schedule_id})`,
    "",
    `**Cron:** \`${data.cron_expr}\``,
    `**Since:** ${sinceText}`,
    "",
    "### Prompt",
    "",
    data.prompt,
    "",
    "### Commits",
    "",
    commitsSection,
  ].join("\n");
}
