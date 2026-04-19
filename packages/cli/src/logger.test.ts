import { describe, expect, it, spyOn, beforeEach, afterEach } from "bun:test";
import type { Issue } from "@magi/core";
import {
  createRichLogger,
  streamWithPrefix,
  logDaemonStart,
  logDaemonReady,
  logDaemonShutdown,
  logDaemonStopped,
} from "./logger.js";

function makeIssue(id: number, overrides?: Partial<Issue>): Issue {
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
    branch: `feat/${id}-test`,
    commit_message: null,
    worktree_path: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("createRichLogger", () => {
  let logSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
    errorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("detect outputs issue id and title", () => {
    const logger = createRichLogger();
    const issue = makeIssue(42);
    logger.detect(issue);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("#42");
    expect(output).toContain("Detected");
    expect(output).toContain("Issue 42");
  });

  it("start outputs separator and issue info", () => {
    const logger = createRichLogger();
    const issue = makeIssue(7);
    logger.start(issue);

    // empty line, separator, start line
    expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    const allOutput = logSpy.mock.calls.map((c) => c[0] as string).join("\n");
    expect(allOutput).toContain("#7");
    expect(allOutput).toContain("Starting");
    expect(allOutput).toContain("Issue 7");
    expect(allOutput).toContain("━");
  });

  it("start records startTime for elapsed calculation", () => {
    const logger = createRichLogger();
    const issue = makeIssue(1);
    logger.start(issue);

    expect(logger.startTimes.has(1)).toBe(true);
  });

  it("complete shows elapsed time and clears startTime", () => {
    const logger = createRichLogger();
    const issue = makeIssue(3);
    logger.start(issue);
    logSpy.mockClear();

    logger.complete(issue);

    expect(logger.startTimes.has(3)).toBe(false);
    const allOutput = logSpy.mock.calls.map((c) => c[0] as string).join("\n");
    expect(allOutput).toContain("Completed");
    expect(allOutput).toContain("#3");
    expect(allOutput).toContain("✓");
  });

  it("fail shows error message and clears startTime", () => {
    const logger = createRichLogger();
    const issue = makeIssue(5);
    logger.start(issue);
    logSpy.mockClear();

    logger.fail(issue, new Error("sandbox crashed"));

    expect(logger.startTimes.has(5)).toBe(false);
    const logOutput = logSpy.mock.calls.map((c) => c[0] as string).join("\n");
    expect(logOutput).toContain("Failed");
    expect(logOutput).toContain("#5");
    expect(logOutput).toContain("✗");

    const errorOutput = errorSpy.mock.calls
      .map((c) => c[0] as string)
      .join("\n");
    expect(errorOutput).toContain("sandbox crashed");
  });
});

describe("streamWithPrefix", () => {
  let writeSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("returns empty string for null stream", async () => {
    const result = await streamWithPrefix(null, 1);
    expect(result).toBe("");
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("prefixes each line with issue id", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("hello\nworld\n"));
        controller.close();
      },
    });

    const result = await streamWithPrefix(stream, 42);

    expect(result).toBe("hello\nworld\n");
    expect(writeSpy.mock.calls.length).toBe(2);
    const line1 = writeSpy.mock.calls[0]![0] as string;
    const line2 = writeSpy.mock.calls[1]![0] as string;
    expect(line1).toContain("#42");
    expect(line1).toContain("hello");
    expect(line2).toContain("#42");
    expect(line2).toContain("world");
  });

  it("handles chunked input across line boundaries", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("hel"));
        controller.enqueue(encoder.encode("lo\nwor"));
        controller.enqueue(encoder.encode("ld\n"));
        controller.close();
      },
    });

    const result = await streamWithPrefix(stream, 1);

    expect(result).toBe("hello\nworld\n");
    // "hello" and "world" should each be written as complete lines
    const lines = writeSpy.mock.calls.map((c) => c[0] as string);
    expect(lines.some((l) => l.includes("hello"))).toBe(true);
    expect(lines.some((l) => l.includes("world"))).toBe(true);
  });

  it("flushes trailing content without newline", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("no-newline"));
        controller.close();
      },
    });

    await streamWithPrefix(stream, 5);

    expect(writeSpy.mock.calls.length).toBe(1);
    const output = writeSpy.mock.calls[0]![0] as string;
    expect(output).toContain("no-newline");
    expect(output).toContain("#5");
  });
});

describe("lifecycle banners", () => {
  let logSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    logSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("logDaemonStart shows interval and concurrency", () => {
    logDaemonStart(30, 2);

    const allOutput = logSpy.mock.calls.map((c) => c[0] as string).join("\n");
    expect(allOutput).toContain("MAGI Daemon Started");
    expect(allOutput).toContain("30s");
    expect(allOutput).toContain("2");
  });

  it("logDaemonReady shows ready message", () => {
    logDaemonReady();

    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("ready");
  });

  it("logDaemonShutdown shows shutdown message", () => {
    logDaemonShutdown();

    const allOutput = logSpy.mock.calls.map((c) => c[0] as string).join("\n");
    expect(allOutput).toContain("Shutting down");
  });

  it("logDaemonStopped shows stopped message", () => {
    logDaemonStopped();

    const output = logSpy.mock.calls[0]![0] as string;
    expect(output).toContain("stopped");
  });
});
