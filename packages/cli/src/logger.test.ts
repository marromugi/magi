import { describe, expect, it, spyOn, beforeEach, afterEach } from "bun:test";
import type { Issue, VerifyJudgment } from "@magi/core";
import {
  createRichLogger,
  createIterationLogger,
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
    session_id: null,
    failed_reason: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("createRichLogger", () => {
  let writeSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  function allOutput(): string {
    return writeSpy.mock.calls.map((c) => c[0] as string).join("");
  }

  it("detect outputs issue id and title", () => {
    const logger = createRichLogger();
    const issue = makeIssue(42);
    logger.detect(issue);

    expect(writeSpy).toHaveBeenCalled();
    const output = allOutput();
    expect(output).toContain("#42");
    expect(output).toContain("Detected");
    expect(output).toContain("Issue 42");
  });

  it("start outputs separator and issue info", () => {
    const logger = createRichLogger();
    const issue = makeIssue(7);
    logger.start(issue);

    const output = allOutput();
    expect(output).toContain("#7");
    expect(output).toContain("Starting");
    expect(output).toContain("Issue 7");
    expect(output).toContain("━");
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
    writeSpy.mockClear();

    logger.complete(issue);

    expect(logger.startTimes.has(3)).toBe(false);
    const output = allOutput();
    expect(output).toContain("Completed");
    expect(output).toContain("#3");
    expect(output).toContain("✓");
  });

  it("fail shows error message and clears startTime", () => {
    const logger = createRichLogger();
    const issue = makeIssue(5);
    logger.start(issue);
    writeSpy.mockClear();

    logger.fail(issue, new Error("sandbox crashed"));

    expect(logger.startTimes.has(5)).toBe(false);
    const output = allOutput();
    expect(output).toContain("Failed");
    expect(output).toContain("#5");
    expect(output).toContain("✗");
    expect(output).toContain("sandbox crashed");
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
    const lines = writeSpy.mock.calls.map((c: unknown[]) => c[0] as string);
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
  let writeSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  function allOutput(): string {
    return writeSpy.mock.calls.map((c: unknown[]) => c[0] as string).join("");
  }

  it("logDaemonStart shows interval and concurrency", () => {
    logDaemonStart(30, 2);

    const output = allOutput();
    expect(output).toContain("MAGI Daemon Started");
    expect(output).toContain("30s");
    expect(output).toContain("2");
  });

  it("logDaemonReady shows ready message", () => {
    logDaemonReady();

    const output = allOutput();
    expect(output).toContain("ready");
  });

  it("logDaemonShutdown shows shutdown message", () => {
    logDaemonShutdown();

    const output = allOutput();
    expect(output).toContain("Shutting down");
  });

  it("logDaemonStopped shows stopped message", () => {
    logDaemonStopped();

    const output = allOutput();
    expect(output).toContain("stopped");
  });
});

describe("createIterationLogger", () => {
  let writeSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    writeSpy = spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  function allOutput(): string {
    return writeSpy.mock.calls.map((c: unknown[]) => c[0] as string).join("");
  }

  it("onAttemptStart outputs issue id, attempt N/M, and 'impl'", () => {
    const issue = makeIssue(10);
    const logger = createIterationLogger(issue);
    logger.onAttemptStart?.(1, 3);

    const output = allOutput();
    expect(output).toContain("#10");
    expect(output).toContain("1/3");
    expect(output).toContain("impl");
  });

  it("onVerifyJudgment outputs issue id, attempt N/M, and 'verify' on pass", () => {
    const issue = makeIssue(10);
    const logger = createIterationLogger(issue);
    const judgment: VerifyJudgment = {
      pass: true,
      summary: "all good",
      failures: [],
    };
    logger.onVerifyJudgment?.(2, 3, judgment);

    const output = allOutput();
    expect(output).toContain("#10");
    expect(output).toContain("2/3");
    expect(output).toContain("verify");
  });

  it("onVerifyJudgment includes failures when judgment fails", () => {
    const issue = makeIssue(7);
    const logger = createIterationLogger(issue);
    const judgment: VerifyJudgment = {
      pass: false,
      summary: "tests failed",
      failures: ["test A failed", "test B failed"],
    };
    logger.onVerifyJudgment?.(1, 3, judgment);

    const output = allOutput();
    expect(output).toContain("test A failed");
    expect(output).toContain("test B failed");
  });

  it("onVerifyJudgment does not output failures list when judgment passes", () => {
    const issue = makeIssue(7);
    const logger = createIterationLogger(issue);
    const judgment: VerifyJudgment = {
      pass: true,
      summary: "all good",
      failures: [],
    };
    logger.onVerifyJudgment?.(1, 3, judgment);

    expect(writeSpy.mock.calls.length).toBe(1);
  });

  it("onRetry outputs issue id, attempt N/M, and 'retry'", () => {
    const issue = makeIssue(10);
    const logger = createIterationLogger(issue);
    const judgment: VerifyJudgment = {
      pass: false,
      summary: "not done",
      failures: [],
    };
    logger.onRetry?.(1, 3, judgment);

    const output = allOutput();
    expect(output).toContain("#10");
    expect(output).toContain("1/3");
    expect(output).toContain("retry");
  });
});
