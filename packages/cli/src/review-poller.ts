import type { ReviewSchedule } from "@magi/core";

export interface ReviewPollerLogger {
  start(schedule: ReviewSchedule): void;
  complete(schedule: ReviewSchedule): void;
  fail(schedule: ReviewSchedule, error: unknown): void;
}

export interface ReviewPollerOptions {
  interval: number;
  fetchDueSchedules(): ReviewSchedule[];
  runSchedule(schedule: ReviewSchedule): Promise<void>;
  logger?: ReviewPollerLogger;
}

export interface ReviewPoller {
  start(): void;
  stop(): Promise<void>;
}

export function createReviewPoller(options: ReviewPollerOptions): ReviewPoller {
  const active = new Set<number>();
  const promises = new Set<Promise<void>>();
  let timer: ReturnType<typeof setInterval> | null = null;

  async function run(schedule: ReviewSchedule): Promise<void> {
    active.add(schedule.id);
    options.logger?.start(schedule);
    try {
      await options.runSchedule(schedule);
      options.logger?.complete(schedule);
    } catch (error) {
      options.logger?.fail(schedule, error);
    } finally {
      active.delete(schedule.id);
    }
  }

  function tick(): void {
    const due = options.fetchDueSchedules();
    for (const schedule of due) {
      if (active.has(schedule.id)) continue;
      const p = run(schedule);
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
