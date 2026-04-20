import { describe, expect, it, mock } from "bun:test";
import { createPRPoller } from "./pr-poller.js";

describe("createPRPoller", () => {
  it("returns an object with start and stop methods", () => {
    const poller = createPRPoller({
      interval: 1000,
      runQueue: async () => {},
    });
    expect(typeof poller.start).toBe("function");
    expect(typeof poller.stop).toBe("function");
  });

  it("calls runQueue immediately on start", async () => {
    const runQueue = mock(async () => {});
    const poller = createPRPoller({
      interval: 60_000,
      runQueue,
    });
    poller.start();
    await poller.stop();
    expect(runQueue).toHaveBeenCalledTimes(1);
  });

  it("does not run queue concurrently", async () => {
    let runCount = 0;

    const { promise: runStarted, resolve: resolveRunStarted } =
      Promise.withResolvers<void>();
    const { promise: allowComplete, resolve: resolveAllowComplete } =
      Promise.withResolvers<void>();

    const poller = createPRPoller({
      interval: 10,
      runQueue: async () => {
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
    const events: string[] = [];
    const poller = createPRPoller({
      interval: 60_000,
      runQueue: async () => {},
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

  it("emits fail event when runQueue throws", async () => {
    const errors: unknown[] = [];
    const poller = createPRPoller({
      interval: 60_000,
      runQueue: async () => {
        throw new Error("pr error");
      },
      logger: {
        start: () => {},
        complete: () => {},
        fail: (e) => errors.push(e),
      },
    });
    poller.start();
    await poller.stop();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });

  it("stops the polling timer after stop()", async () => {
    const runQueue = mock(async () => {});
    const poller = createPRPoller({
      interval: 10,
      runQueue,
    });
    poller.start();
    await Bun.sleep(50);
    await poller.stop();
    const countAtStop = runQueue.mock.calls.length;
    await Bun.sleep(50);
    expect(runQueue.mock.calls.length).toBe(countAtStop);
  });

  it("stop() waits for in-flight runQueue call to complete", async () => {
    let completed = false;
    const poller = createPRPoller({
      interval: 60_000,
      runQueue: async () => {
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
