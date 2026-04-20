import { describe, expect, it } from "bun:test";
import { LogEventBus } from "./log-event-bus.js";
import type { LogEvent } from "./log-event-bus.js";

describe("LogEventBus", () => {
  it("subscribe listener receives emitted events", () => {
    const bus = new LogEventBus();
    const received: LogEvent[] = [];

    const listener = (event: LogEvent) => received.push(event);
    bus.subscribe(listener);

    const event: LogEvent = {
      timestamp: new Date().toISOString(),
      issueId: 1,
      type: "detect",
      payload: { title: "Test Issue" },
    };
    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  it("unsubscribe stops listener from receiving events", () => {
    const bus = new LogEventBus();
    const received: LogEvent[] = [];

    const listener = (event: LogEvent) => received.push(event);
    bus.subscribe(listener);
    bus.unsubscribe(listener);

    bus.emit({
      timestamp: new Date().toISOString(),
      issueId: 1,
      type: "detect",
      payload: {},
    });

    expect(received).toHaveLength(0);
  });

  it("multiple listeners all receive events", () => {
    const bus = new LogEventBus();
    const received1: LogEvent[] = [];
    const received2: LogEvent[] = [];

    bus.subscribe((e) => received1.push(e));
    bus.subscribe((e) => received2.push(e));

    bus.emit({
      timestamp: new Date().toISOString(),
      issueId: 2,
      type: "start",
      payload: { title: "Issue 2" },
    });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it("only the unsubscribed listener stops receiving", () => {
    const bus = new LogEventBus();
    const received1: LogEvent[] = [];
    const received2: LogEvent[] = [];

    const listener1 = (e: LogEvent) => received1.push(e);
    const listener2 = (e: LogEvent) => received2.push(e);

    bus.subscribe(listener1);
    bus.subscribe(listener2);
    bus.unsubscribe(listener1);

    bus.emit({
      timestamp: new Date().toISOString(),
      issueId: 3,
      type: "complete",
      payload: {},
    });

    expect(received1).toHaveLength(0);
    expect(received2).toHaveLength(1);
  });

  it("event carries timestamp, issueId, type, and payload", () => {
    const bus = new LogEventBus();
    let received: LogEvent | undefined;

    bus.subscribe((e) => {
      received = e;
    });

    const now = new Date().toISOString();
    bus.emit({
      timestamp: now,
      issueId: 42,
      type: "complete",
      payload: { title: "Test", elapsedMs: 1000 },
    });

    expect(received).toBeDefined();
    expect(received!.timestamp).toBe(now);
    expect(received!.issueId).toBe(42);
    expect(received!.type).toBe("complete");
    expect(received!.payload).toEqual({ title: "Test", elapsedMs: 1000 });
  });
});
