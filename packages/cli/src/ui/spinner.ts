import type { Format } from "./format";
import type { Writer } from "./writer";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL_MS = 80;

export interface Spinner {
  start: (message: string) => SpinnerStop;
}

export type SpinnerStop = (
  finalMessage?: string,
  type?: "success" | "error",
) => void;

export function createSpinner(writer: Writer, fmt: Format): Spinner {
  return {
    start(message: string): SpinnerStop {
      let frameIdx = 0;
      const clearLine = "\r\x1b[2K";

      function render() {
        const frame = fmt.cyan(FRAMES[frameIdx % FRAMES.length]!);
        writer.write(`${clearLine}${frame} ${message}`);
        frameIdx++;
      }

      render();
      const timer = setInterval(render, INTERVAL_MS);

      return (finalMessage?: string, type: "success" | "error" = "success") => {
        clearInterval(timer);
        writer.write(clearLine);
        if (finalMessage) {
          const icon = type === "success" ? fmt.green("✔") : fmt.red("✖");
          writer.write(`${icon} ${finalMessage}\n`);
        }
      };
    },
  };
}
