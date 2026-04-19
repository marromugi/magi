import type { Issue } from "./issue.js";
import { listIssues } from "./issue.js";

export function listPRQueue(dbPath: string): Issue[] | Error {
  const issues = listIssues(dbPath, { status: ["implemented"] });
  return topologicalSort(issues);
}

function topologicalSort(issues: Issue[]): Issue[] | Error {
  const idSet = new Set(issues.map((i) => i.id));
  const inDegree = new Map<number, number>(issues.map((i) => [i.id, 0]));
  const dependents = new Map<number, number[]>(issues.map((i) => [i.id, []]));

  for (const issue of issues) {
    const deps = JSON.parse(issue.depends_on) as number[];
    for (const depId of deps) {
      if (!idSet.has(depId)) continue;
      dependents.get(depId)!.push(issue.id);
      inDegree.set(issue.id, inDegree.get(issue.id)! + 1);
    }
  }

  const issueMap = new Map(issues.map((i) => [i.id, i]));
  const queue = issues
    .filter((i) => inDegree.get(i.id) === 0)
    .map((i) => i.id)
    .sort((a, b) => a - b);

  const result: Issue[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(issueMap.get(id)!);

    const next = dependents.get(id)!;
    for (const neighborId of next) {
      const deg = inDegree.get(neighborId)! - 1;
      inDegree.set(neighborId, deg);
      if (deg === 0) {
        const insertIdx = queue.findIndex((q) => q > neighborId);
        if (insertIdx === -1) queue.push(neighborId);
        else queue.splice(insertIdx, 0, neighborId);
      }
    }
  }

  if (result.length !== issues.length) {
    return new Error("Circular dependency detected");
  }

  return result;
}
