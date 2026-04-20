import { describe, expect, it, mock } from "bun:test";
import { createReviewPoller } from "./review-poller.js";
import type { ReviewSchedule } from "@magi/core";

function makeSchedule(
  id: number,
  overrides: Partial<ReviewSchedule> = {},
): ReviewSchedule {
  return {
    id,
    cron_expr: "0 * * * *",
    branch: "main",
    prompt: "",
    last_reviewed_at: null,
    enabled: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("createReviewPoller", () => {
  it("returns an object with start and stop methods", () => {
    const poller = createReviewPoller({
      interval: 1000,
      fetchDueSchedules: () => [],
      runSchedule: async () => {},
    });
    expect(typeof poller.start).toBe("function");
    expect(typeof poller.stop).toBe("function");
  });

  it("fetches due schedules immediately on start", async () => {
    const fetchDueSchedules = mock(() => []);
    const poller = createReviewPoller({
      interval: 60_000,
      fetchDueSchedules,
      runSchedule: async () => {},
    });
    poller.start();
    await poller.stop();
    expect(fetchDueSchedules).toHaveBeenCalledTimes(1);
  });

  it("calls runSchedule for each due schedule", async () => {
    const schedules = [makeSchedule(1), makeSchedule(2)];
    const runSchedule = mock(async (_s: ReviewSchedule) => {});
    const poller = createReviewPoller({
      interval: 60_000,
      fetchDueSchedules: () => schedules,
      runSchedule,
    });
    poller.start();
    await poller.stop();
    expect(runSchedule).toHaveBeenCalledTimes(2);
    expect(runSchedule).toHaveBeenCalledWith(schedules[0]);
    expect(runSchedule).toHaveBeenCalledWith(schedules[1]);
  });

  it("does not run the same schedule concurrently", async () => {
    let runCount = 0;
    const schedule = makeSchedule(1);

    const { promise: runStarted, resolve: resolveRunStarted } =
      Promise.withResolvers<void>();
    const { promise: allowComplete, resolve: resolveAllowComplete } =
      Promise.withResolvers<void>();

    const poller = createReviewPoller({
      interval: 10,
      fetchDueSchedules: () => [schedule],
      runSchedule: async () => {
        runCount++;
        resolveRunStarted();
        await allowComplete;
      },
    });
    poller.start();
    await runStarted;
    await Bun.sleep(50);
    expect(runCount).toBe(1);
    resolveAllowComplete();
    await poller.stop();
    expect(runCount).toBe(1);
  });

  it("emits start and complete events on success", async () => {
    const schedule = makeSchedule(1);
    const events: string[] = [];
    const poller = createReviewPoller({
      interval: 60_000,
      fetchDueSchedules: () => [schedule],
      runSchedule: async () => {},
      logger: {
        start: () => events.push("start"),
        complete: () => events.push("complete"),
        fail: () => events.push("fail"),
      },
    });
    poller.start();
    await poller.stop();
    expect(events).toEqual(["start", "complete"]);
  });

  it("emits fail event when runSchedule throws", async () => {
    const schedule = makeSchedule(1);
    const failed: ReviewSchedule[] = [];
    const poller = createReviewPoller({
      interval: 60_000,
      fetchDueSchedules: () => [schedule],
      runSchedule: async () => {
        throw new Error("review error");
      },
      logger: {
        start: () => {},
        complete: () => {},
        fail: (s) => failed.push(s),
      },
    });
    poller.start();
    await poller.stop();
    expect(failed).toEqual([schedule]);
  });

  it("stops the polling timer after stop()", async () => {
    const fetchDueSchedules = mock(() => []);
    const poller = createReviewPoller({
      interval: 10,
      fetchDueSchedules,
      runSchedule: async () => {},
    });
    poller.start();
    await Bun.sleep(50);
    await poller.stop();
    const countAtStop = fetchDueSchedules.mock.calls.length;
    await Bun.sleep(50);
    expect(fetchDueSchedules.mock.calls.length).toBe(countAtStop);
  });

  it("stop() waits for in-flight runSchedule calls to complete", async () => {
    let completed = false;
    const poller = createReviewPoller({
      interval: 60_000,
      fetchDueSchedules: () => [makeSchedule(1)],
      runSchedule: async () => {
        await Bun.sleep(50);
        completed = true;
      },
    });
    poller.start();
    await Bun.sleep(5);
    await poller.stop();
    expect(completed).toBe(true);
  });
});
