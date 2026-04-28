export interface CDPResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export class CDPClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }
  >();
  private eventHandlers = new Map<string, ((params: unknown) => void)[]>();

  async connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error(`CDP connection error: ${e}`));

      this.ws.onmessage = (event) => {
        const data = JSON.parse(String(event.data)) as CDPResponse & {
          method?: string;
          params?: unknown;
        };

        if (data.id !== undefined) {
          const handler = this.pending.get(data.id);
          if (handler) {
            this.pending.delete(data.id);
            if (data.error) {
              handler.reject(
                new Error(
                  `CDP error: ${data.error.message} (${data.error.code})`,
                ),
              );
            } else {
              handler.resolve(data.result ?? {});
            }
          }
        } else if (data.method) {
          const handlers = this.eventHandlers.get(data.method);
          if (handlers) {
            for (const h of handlers) h(data.params);
          }
        }
      };

      this.ws.onclose = () => {
        for (const [, handler] of this.pending) {
          handler.reject(new Error("CDP connection closed"));
        }
        this.pending.clear();
      };
    });
  }

  async send(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("CDP not connected");
    }

    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(message);
    });
  }

  on(event: string, handler: (params: unknown) => void): void {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  async close(): Promise<void> {
    this.ws?.close();
    this.ws = null;
  }
}
