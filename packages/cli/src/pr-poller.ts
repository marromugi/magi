export interface PRPollerLogger {
  start(): void;
  complete(): void;
  fail(error: unknown): void;
}

export interface PRPollerOptions {
  interval: number;
  runQueue(): Promise<void>;
  logger?: PRPollerLogger;
}

export interface PRPoller {
  start(): void;
  stop(): Promise<void>;
}

export function createPRPoller(options: PRPollerOptions): PRPoller {
  let running = false;
  let promise: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    options.logger?.start();
    try {
      await options.runQueue();
      options.logger?.complete();
    } catch (error) {
      options.logger?.fail(error);
    } finally {
      running = false;
    }
  }

  function tick(): void {
    if (running) return;
    promise = run();
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
      if (promise !== null) {
        await promise;
      }
    },
  };
}
