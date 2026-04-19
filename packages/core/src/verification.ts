/** Structured verification judgment from Claude */
export interface VerifyJudgment {
  pass: boolean;
  summary: string;
  failures: string[];
}

export const VERIFY_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    pass: { type: "boolean" as const },
    summary: { type: "string" as const },
    failures: { type: "array" as const, items: { type: "string" as const } },
  },
  required: ["pass", "summary", "failures"] as const,
};

/**
 * Build a verification prompt that instructs Claude to:
 * 1. Run `bun test` and check results
 * 2. Review the code changes against the original issue requirements
 * 3. Judge if the root cause is truly resolved
 * 4. Return structured JSON matching VERIFY_JSON_SCHEMA
 */
export function buildVerifyPrompt(
  issuePrompt: string,
  attempt: number,
): string {
  return `## Verification (attempt ${attempt})

You are a verification agent. Your job is to review the implementation and determine if it correctly resolves the original issue.

### Original Issue
${issuePrompt}

### Instructions

1. Run \`bun test\` and check that all tests pass
2. Review the code changes (use \`git diff\`) against the original issue requirements
3. Judge whether the root cause is truly resolved and the acceptance criteria are met
4. Return your judgment as structured JSON

### Important
- Be strict: partial fixes should fail verification
- Check edge cases mentioned in the requirements
- Verify that tests actually cover the acceptance criteria, not just pass trivially`;
}

/**
 * Build a re-implementation prompt that includes:
 * - The original implementation prompt
 * - What the verification found lacking (from failures array)
 * - Instructions to address specifically those gaps
 */
export function buildReimplementPrompt(
  originalPrompt: string,
  feedback: VerifyJudgment,
): string {
  const failureList = feedback.failures
    .map((f, i) => `${i + 1}. ${f}`)
    .join("\n");

  return `## Re-implementation Required

The previous implementation was reviewed and found lacking. Please address the specific issues below.

### Original Task
${originalPrompt}

### Verification Feedback
**Summary**: ${feedback.summary}

**Failures to fix**:
${failureList}

### Instructions
- Focus on the specific failures listed above and resolve each one
- Do NOT start from scratch — build on the existing code
- Run \`bun test\` after making changes to verify your fix
- Make sure all acceptance criteria from the original task are met`;
}
