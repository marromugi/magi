import type { Format } from "./format";
import type { Writer } from "./writer";

export interface Output {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  empty: (message: string) => void;
  header: (title: string) => void;
  newline: () => void;
}

export function createOutput(writer: Writer, fmt: Format): Output {
  return {
    success(message: string) {
      writer.write(`${fmt.green("✔")} ${message}\n`);
    },
    error(message: string) {
      writer.writeError(`${fmt.red("✖")} ${message}\n`);
    },
    info(message: string) {
      writer.write(`${fmt.blue("ℹ")} ${message}\n`);
    },
    warn(message: string) {
      writer.writeError(`${fmt.yellow("⚠")} ${message}\n`);
    },
    empty(message: string) {
      writer.write(`${fmt.dim(message)}\n`);
    },
    header(title: string) {
      writer.write(`${fmt.dim("──")} ${fmt.bold(title)} ${fmt.dim("──")}\n`);
    },
    newline() {
      writer.write("\n");
    },
  };
}
