import { EventEmitter } from "events";

export type LogEventType = "detect" | "start" | "complete" | "fail" | "stream";

export interface LogEvent {
  timestamp: string;
  issueId: number;
  type: LogEventType;
  payload: Record<string, unknown>;
}

export type LogEventListener = (event: LogEvent) => void;

export class LogEventBus {
  private emitter = new EventEmitter();

  emit(event: LogEvent): void {
    this.emitter.emit("log", event);
  }

  subscribe(listener: LogEventListener): void {
    this.emitter.on("log", listener);
  }

  unsubscribe(listener: LogEventListener): void {
    this.emitter.off("log", listener);
  }
}
