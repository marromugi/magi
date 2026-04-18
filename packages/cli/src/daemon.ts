import type { Issue } from "@magi/core";

export interface DaemonLogger {
  detect(issue: Issue): void;
  start(issue: Issue): void;
  complete(issue: Issue): void;
  fail(issue: Issue, error: unknown): void;
}

export interface DaemonOptions {
  interval: number;
  concurrency: number;
  fetchReadyIssues(): Issue[];
  runIssue(issue: Issue): Promise<void>;
  logger?: DaemonLogger;
}

export interface Daemon {
  start(): void;
  stop(): Promise<void>;
}

export function createDaemon(options: DaemonOptions): Daemon {
  const active = new Set<number>();
  const promises = new Set<Promise<void>>();
  let timer: ReturnType<typeof setInterval> | null = null;

  async function run(issue: Issue): Promise<void> {
    active.add(issue.id);
    options.logger?.start(issue);
    try {
      await options.runIssue(issue);
      options.logger?.complete(issue);
    } catch (error) {
      options.logger?.fail(issue, error);
    } finally {
      active.delete(issue.id);
    }
  }

  function tick(): void {
    const available = options.concurrency - active.size;
    if (available <= 0) return;

    const candidates = options
      .fetchReadyIssues()
      .filter((i) => !active.has(i.id))
      .slice(0, available);

    for (const issue of candidates) {
      options.logger?.detect(issue);
      const p = run(issue);
      promises.add(p);
      p.finally(() => promises.delete(p));
    }
  }

  return {
    start() {
      tick();
      timer = setInterval(tick, options.interval);
    },

    async stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      await Promise.allSettled([...promises]);
    },
  };
}
