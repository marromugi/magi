import { describe, test, expect, mock } from "bun:test";
import { startDaemon, DEFAULT_INTERVAL_MS } from "./daemon";
import type { Issue } from "./issue";

function makeIssue(id: number): Issue {
  return {
    id,
    title: `Issue ${id}`,
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
    session_id: null,
    failed_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function makeDeps(issues: Issue[] = []) {
  return {
    listReadyIssues: mock(() => issues),
    updateIssue: mock(() => null),
  };
}

describe("DEFAULT_INTERVAL_MS", () => {
  test("is 30 seconds", () => {
    expect(DEFAULT_INTERVAL_MS).toBe(30_000);
  });
});

describe("startDaemon", () => {
  test("polls ready issues and dispatches them", async () => {
    const issue = makeIssue(1);
    const deps = makeDeps([issue]);
    // slow enough to stay in-flight across polls, so dispatch runs exactly once
    const dispatch = mock(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    const daemon = startDaemon(
      { dbPath: ":memory:", intervalMs: 50, dispatch },
      deps,
    );
    await new Promise((r) => setTimeout(r, 80));
    daemon.stop();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(issue);
  });

  test("dispatches multiple ready issues in parallel", async () => {
    const issues = [makeIssue(1), makeIssue(2), makeIssue(3)];
    const deps = makeDeps(issues);
    const startTimes: number[] = [];
    const dispatch = mock(async () => {
      startTimes.push(Date.now());
      await new Promise((r) => setTimeout(r, 50));
    });

    const daemon = startDaemon(
      { dbPath: ":memory:", intervalMs: 500, dispatch },
      deps,
    );
    await new Promise((r) => setTimeout(r, 120));
    daemon.stop();

    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(startTimes[startTimes.length - 1] - startTimes[0]).toBeLessThan(30);
  });

  test("does not re-dispatch in-flight issues on subsequent polls", async () => {
    const issue = makeIssue(1);
    const deps = makeDeps([issue]);
    let dispatchCount = 0;
    const dispatch = mock(async () => {
      dispatchCount++;
      await new Promise((r) => setTimeout(r, 300));
    });

    const daemon = startDaemon(
      { dbPath: ":memory:", intervalMs: 30, dispatch },
      deps,
    );
    await new Promise((r) => setTimeout(r, 120));
    daemon.stop();

    expect(dispatchCount).toBe(1);
  });

  test("marks issue as active before dispatching", async () => {
    const issue = makeIssue(1);
    const deps = makeDeps([issue]);
    const dispatch = mock(async () => {});

    const daemon = startDaemon(
      { dbPath: ":memory:", intervalMs: 500, dispatch },
      deps,
    );
    await new Promise((r) => setTimeout(r, 50));
    daemon.stop();

    expect(deps.updateIssue).toHaveBeenCalledWith(":memory:", 1, {
      status: "active",
    });
  });

  test("stops polling after stop() is called", async () => {
    const deps = makeDeps([]);
    const dispatch = mock(async () => {});

    const daemon = startDaemon(
      { dbPath: ":memory:", intervalMs: 30, dispatch },
      deps,
    );
    await new Promise((r) => setTimeout(r, 50));
    const countBefore = deps.listReadyIssues.mock.calls.length;
    daemon.stop();
    await new Promise((r) => setTimeout(r, 100));

    expect(deps.listReadyIssues.mock.calls.length).toBe(countBefore);
  });

  test("calls onError when dispatch throws", async () => {
    const issue = makeIssue(1);
    const deps = makeDeps([issue]);
    const error = new Error("dispatch failed");
    const dispatch = mock(async () => {
      throw error;
    });
    const onError = mock(() => {});

    const daemon = startDaemon(
      { dbPath: ":memory:", intervalMs: 500, dispatch, onError },
      deps,
    );
    await new Promise((r) => setTimeout(r, 50));
    daemon.stop();

    expect(onError).toHaveBeenCalledWith(error);
  });

  test("marks issue as failed when dispatch throws", async () => {
    const issue = makeIssue(1);
    const deps = makeDeps([issue]);
    const error = new Error("dispatch failed");
    const dispatch = mock(async () => {
      throw error;
    });

    const daemon = startDaemon(
      { dbPath: ":memory:", intervalMs: 500, dispatch },
      deps,
    );
    await new Promise((r) => setTimeout(r, 50));
    daemon.stop();

    expect(deps.updateIssue).toHaveBeenCalledWith(":memory:", 1, {
      status: "failed",
      failed_reason: "dispatch failed",
    });
  });

  test("records stringified failed_reason when dispatch throws non-Error", async () => {
    const issue = makeIssue(1);
    const deps = makeDeps([issue]);
    const dispatch = mock(async () => {
      throw "something went wrong";
    });

    const daemon = startDaemon(
      { dbPath: ":memory:", intervalMs: 500, dispatch },
      deps,
    );
    await new Promise((r) => setTimeout(r, 50));
    daemon.stop();

    expect(deps.updateIssue).toHaveBeenCalledWith(":memory:", 1, {
      status: "failed",
      failed_reason: "something went wrong",
    });
  });

  test("can start without intervalMs using default", () => {
    const deps = makeDeps([]);
    const dispatch = mock(async () => {});
    const daemon = startDaemon({ dbPath: ":memory:", dispatch }, deps);
    daemon.stop();
  });
});
