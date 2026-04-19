import { describe, expect, it, mock } from "bun:test";
import { createDaemon } from "./daemon.js";
import type { Issue } from "@magi/core";

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
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("createDaemon", () => {
  it("returns an object with start and stop methods", () => {
    const daemon = createDaemon({
      interval: 1000,
      concurrency: 1,
      fetchReadyIssues: () => [],
      runIssue: async () => {},
    });
    expect(typeof daemon.start).toBe("function");
    expect(typeof daemon.stop).toBe("function");
  });

  it("fetches ready issues immediately on start", async () => {
    const fetchReadyIssues = mock(() => []);
    const daemon = createDaemon({
      interval: 60_000,
      concurrency: 1,
      fetchReadyIssues,
      runIssue: async () => {},
    });
    daemon.start();
    await daemon.stop();
    expect(fetchReadyIssues).toHaveBeenCalledTimes(1);
  });

  it("calls runIssue for each ready issue within concurrency", async () => {
    const issues = [makeIssue(1), makeIssue(2)];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const runIssue = mock(async (_issue: Issue) => {});
    const daemon = createDaemon({
      interval: 60_000,
      concurrency: 2,
      fetchReadyIssues: () => issues,
      runIssue,
    });
    daemon.start();
    await daemon.stop();
    expect(runIssue).toHaveBeenCalledTimes(2);
    expect(runIssue).toHaveBeenCalledWith(issues[0]);
    expect(runIssue).toHaveBeenCalledWith(issues[1]);
  });

  it("respects concurrency limit per tick", async () => {
    const started: number[] = [];
    const daemon = createDaemon({
      interval: 60_000,
      concurrency: 2,
      fetchReadyIssues: () => [makeIssue(1), makeIssue(2), makeIssue(3)],
      runIssue: async (issue) => {
        started.push(issue.id);
      },
    });
    daemon.start();
    await daemon.stop();
    expect(started).toHaveLength(2);
  });

  it("does not process the same issue concurrently", async () => {
    let runCount = 0;
    const issue = makeIssue(1);

    const { promise: runStarted, resolve: resolveRunStarted } =
      Promise.withResolvers<void>();
    const { promise: allowComplete, resolve: resolveAllowComplete } =
      Promise.withResolvers<void>();

    const daemon = createDaemon({
      interval: 10,
      concurrency: 2,
      fetchReadyIssues: () => [issue],
      runIssue: async () => {
        runCount++;
        resolveRunStarted();
        await allowComplete;
      },
    });
    daemon.start();
    await runStarted;
    // Let several ticks fire while issue is in-flight
    await Bun.sleep(50);
    // Issue should not have been started again
    expect(runCount).toBe(1);
    resolveAllowComplete();
    await daemon.stop();
    expect(runCount).toBe(1);
  });

  it("emits detect event when an issue is found", async () => {
    const issue = makeIssue(1);
    const detected: Issue[] = [];
    const daemon = createDaemon({
      interval: 60_000,
      concurrency: 1,
      fetchReadyIssues: () => [issue],
      runIssue: async () => {},
      logger: {
        detect: (i) => detected.push(i),
        start: () => {},
        complete: () => {},
        fail: () => {},
      },
    });
    daemon.start();
    await daemon.stop();
    expect(detected).toEqual([issue]);
  });

  it("emits start and complete events on success", async () => {
    const issue = makeIssue(1);
    const events: string[] = [];
    const daemon = createDaemon({
      interval: 60_000,
      concurrency: 1,
      fetchReadyIssues: () => [issue],
      runIssue: async () => {},
      logger: {
        detect: () => {},
        start: () => events.push("start"),
        complete: () => events.push("complete"),
        fail: () => events.push("fail"),
      },
    });
    daemon.start();
    await daemon.stop();
    expect(events).toEqual(["start", "complete"]);
  });

  it("emits fail event when runIssue throws", async () => {
    const issue = makeIssue(1);
    const failed: Issue[] = [];
    const daemon = createDaemon({
      interval: 60_000,
      concurrency: 1,
      fetchReadyIssues: () => [issue],
      runIssue: async () => {
        throw new Error("test error");
      },
      logger: {
        detect: () => {},
        start: () => {},
        complete: () => {},
        fail: (i) => failed.push(i),
      },
    });
    daemon.start();
    await daemon.stop();
    expect(failed).toEqual([issue]);
  });

  it("stops the polling timer after stop()", async () => {
    const fetchReadyIssues = mock(() => []);
    const daemon = createDaemon({
      interval: 10,
      concurrency: 1,
      fetchReadyIssues,
      runIssue: async () => {},
    });
    daemon.start();
    await Bun.sleep(50);
    await daemon.stop();
    const countAtStop = fetchReadyIssues.mock.calls.length;
    await Bun.sleep(50);
    expect(fetchReadyIssues.mock.calls.length).toBe(countAtStop);
  });

  it("immediately picks up next ready issue after completion", async () => {
    const runOrder: number[] = [];
    const readyQueue = [makeIssue(1), makeIssue(2)];
    const daemon = createDaemon({
      interval: 60_000, // long interval — should not matter
      concurrency: 1,
      fetchReadyIssues: () => {
        // Return first not-yet-run issue (simulates status change after run)
        return readyQueue.filter((i) => !runOrder.includes(i.id));
      },
      runIssue: async (issue) => {
        runOrder.push(issue.id);
      },
    });
    daemon.start();
    // Wait enough for both to complete (but far less than interval)
    await Bun.sleep(50);
    await daemon.stop();
    expect(runOrder).toEqual([1, 2]);
  });

  it("stop() waits for in-flight runIssue calls to complete", async () => {
    let completed = false;
    const daemon = createDaemon({
      interval: 60_000,
      concurrency: 1,
      fetchReadyIssues: () => [makeIssue(1)],
      runIssue: async () => {
        await Bun.sleep(50);
        completed = true;
      },
    });
    daemon.start();
    await Bun.sleep(5);
    await daemon.stop();
    expect(completed).toBe(true);
  });
});
