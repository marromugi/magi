import { createFormat, detectColorSupport } from "./format";
import { createOutput } from "./output";
import { createTable } from "./table";
import { createSpinner } from "./spinner";
import { consoleWriter } from "./writer";
import type { Format } from "./format";
import type { Output } from "./output";
import type { Table } from "./table";
import type { Spinner } from "./spinner";

export type { Format, Output, Table, Spinner };
export { createFormat, detectColorSupport } from "./format";
export { createOutput } from "./output";
export { createTable } from "./table";
export { createSpinner } from "./spinner";
export { consoleWriter, createBufferWriter } from "./writer";
export type { Writer } from "./writer";

export interface UI extends Output, Table {
  fmt: Format;
  spinner: Spinner;
}

export function createUI(options?: { color?: boolean }): UI {
  const colorEnabled = options?.color ?? detectColorSupport();
  const fmt = createFormat(colorEnabled);
  const writer = consoleWriter;
  const output = createOutput(writer, fmt);
  const table = createTable(writer, fmt);
  const spin = createSpinner(writer, fmt);

  return {
    fmt,
    ...output,
    ...table,
    spinner: spin,
  };
}
