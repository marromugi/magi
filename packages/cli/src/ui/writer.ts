export interface Writer {
  write(text: string): void;
  writeError(text: string): void;
}

export const consoleWriter: Writer = {
  write(text: string) {
    process.stdout.write(text);
  },
  writeError(text: string) {
    process.stderr.write(text);
  },
};

export function createBufferWriter(): Writer & {
  output: string;
  errorOutput: string;
} {
  const writer = {
    output: "",
    errorOutput: "",
    write(text: string) {
      writer.output += text;
    },
    writeError(text: string) {
      writer.errorOutput += text;
    },
  };
  return writer;
}
