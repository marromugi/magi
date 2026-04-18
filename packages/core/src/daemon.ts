import {
  listReadyIssues as _listReadyIssues,
  updateIssue as _updateIssue,
} from "./issue.js";
import type { Issue, UpdateIssueInput } from "./issue.js";

export interface DaemonOptions {
  dbPath: string;
  intervalMs?: number;
  dispatch: (issue: Issue) => Promise<void>;
  onError?: (error: unknown) => void;
}

export interface DaemonHandle {
  stop: () => void;
}

export const DEFAULT_INTERVAL_MS = 30_000;

interface DaemonDeps {
  listReadyIssues: (dbPath: string) => Issue[];
  updateIssue: (dbPath: string, id: number, input: UpdateIssueInput) => Issue | null;
}

export function startDaemon(options: DaemonOptions, deps?: Partial<DaemonDeps>): DaemonHandle {
  const { dbPath, intervalMs = DEFAULT_INTERVAL_MS, dispatch, onError } = options;
  const listFn = deps?.listReadyIssues ?? _listReadyIssues;
  const updateFn = deps?.updateIssue ?? _updateIssue;
  const inFlight = new Set<number>();

  const poll = () => {
    const ready = listFn(dbPath);
    for (const issue of ready) {
      if (inFlight.has(issue.id)) continue;
      inFlight.add(issue.id);
      updateFn(dbPath, issue.id, { status: "active" });
      dispatch(issue)
        .catch((err) => onError?.(err))
        .finally(() => inFlight.delete(issue.id));
    }
  };

  poll();
  const timer = setInterval(poll, intervalMs);

  return { stop: () => clearInterval(timer) };
}
