import type { Issue } from "@magi/core";
import type { DaemonLogger } from "./daemon.js";

// ── ANSI escape codes ──

const ESC = "\x1b[";

export const style = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,

  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,
  gray: `${ESC}90m`,
} as const;

function c(s: string, ...styles: string[]): string {
  return styles.join("") + s + style.reset;
}

// ── Unified output ──

function writeln(line: string): void {
  process.stdout.write(`${line}\n`);
}

// ── Formatting helpers ──

function timestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return c(`${h}:${m}:${s}`, style.dim);
}

function issueTag(issue: Issue): string {
  return c(`#${issue.id}`, style.bold, style.cyan);
}

function separator(issue: Issue): string {
  const label = ` #${issue.id} ${issue.branch ?? issue.title} `;
  const totalWidth = 56;
  const leftLen = 3;
  const rightLen = Math.max(1, totalWidth - leftLen - label.length);
  const left = "━".repeat(leftLen);
  const right = "━".repeat(rightLen);
  return c(`${left}${label}${right}`, style.dim);
}

function elapsed(startTime: number): string {
  const ms = Date.now() - startTime;
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return `${min}m ${remSec}s`;
}

// ── Stream helpers ──

export async function streamWithPrefix(
  stream: ReadableStream<Uint8Array> | null,
  issueId: number,
): Promise<string> {
  if (!stream) return "";

  const prefix = c(`  │ #${issueId} │ `, style.dim);
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";
  let collected = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    collected += chunk;
    buffer += chunk;

    const lines = buffer.split("\n");
    // Keep the last incomplete line in buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      process.stdout.write(`${prefix}${line}\n`);
    }
  }

  // Flush remaining buffer
  if (buffer.length > 0) {
    process.stdout.write(`${prefix}${buffer}\n`);
  }

  return collected;
}

// ── DaemonLogger implementation ──

export interface RichLoggerState {
  startTimes: Map<number, number>;
}

export function createRichLogger(): DaemonLogger & RichLoggerState {
  const startTimes = new Map<number, number>();

  return {
    startTimes,

    detect(issue: Issue) {
      writeln(
        `${timestamp()} ${c("◆", style.yellow)} ${c("Detected", style.yellow)} ${issueTag(issue)} ${c(issue.title, style.dim)}`,
      );
    },

    start(issue: Issue) {
      startTimes.set(issue.id, Date.now());
      writeln("");
      writeln(separator(issue));
      writeln(
        `${timestamp()} ${c("▶", style.bold, style.blue)} ${c("Starting", style.bold)} ${issueTag(issue)} ${issue.title}`,
      );
    },

    complete(issue: Issue) {
      const start = startTimes.get(issue.id);
      const dur = start ? c(`(${elapsed(start)})`, style.dim) : "";
      startTimes.delete(issue.id);
      writeln(
        `${timestamp()} ${c("✓", style.bold, style.green)} ${c("Completed", style.bold, style.green)} ${issueTag(issue)} ${dur}`,
      );
      writeln(separator(issue));
      writeln("");
    },

    fail(issue: Issue, error: unknown) {
      const start = startTimes.get(issue.id);
      const dur = start ? c(`(${elapsed(start)})`, style.dim) : "";
      startTimes.delete(issue.id);
      writeln(
        `${timestamp()} ${c("✗", style.bold, style.red)} ${c("Failed", style.bold, style.red)} ${issueTag(issue)} ${dur}`,
      );
      writeln(`  ${c(String(error), style.red)}`);
      writeln(separator(issue));
      writeln("");
    },
  };
}

// ── Daemon lifecycle banners ──

export function logDaemonStart(interval: number, concurrency: number): void {
  writeln("");
  writeln(
    c("  ╔══════════════════════════════════════╗", style.bold, style.magenta),
  );
  writeln(
    c("  ║         MAGI Daemon Started          ║", style.bold, style.magenta),
  );
  writeln(
    c("  ╚══════════════════════════════════════╝", style.bold, style.magenta),
  );
  writeln("");
  writeln(
    `  ${c("interval:", style.dim)} ${c(`${interval}s`, style.white)}   ${c("concurrency:", style.dim)} ${c(String(concurrency), style.white)}`,
  );
  writeln("");
}

export function logDaemonReady(): void {
  writeln(
    `${timestamp()} ${c("●", style.bold, style.green)} ${c("Daemon ready — polling for issues", style.green)}`,
  );
}

export function logDaemonShutdown(): void {
  writeln("");
  writeln(
    `${timestamp()} ${c("■", style.yellow)} ${c("Shutting down...", style.yellow)}`,
  );
}

export function logDaemonStopped(): void {
  writeln(
    `${timestamp()} ${c("●", style.dim)} ${c("Daemon stopped", style.dim)}`,
  );
}
