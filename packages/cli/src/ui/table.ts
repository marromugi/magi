import type { Format } from "./format";
import type { Writer } from "./writer";

export interface Table {
  keyValue: (entries: [string, string][]) => void;
  table: (opts: { headers: string[]; rows: string[][] }) => void;
}

const INDENT = "  ";
const COL_GAP = "  ";

export function createTable(writer: Writer, fmt: Format): Table {
  return {
    keyValue(entries: [string, string][]) {
      const sorted = [...entries].sort((a, b) => a[0].localeCompare(b[0]));
      const maxLabel = Math.max(...sorted.map(([label]) => label.length));

      for (const [label, value] of sorted) {
        const paddedLabel = label.padEnd(maxLabel);
        writer.write(`${INDENT}${fmt.dim(paddedLabel)}${COL_GAP}${value}\n`);
      }
    },

    table(opts: { headers: string[]; rows: string[][] }) {
      const allRows = [opts.headers, ...opts.rows];
      const colWidths = opts.headers.map((_, colIdx) =>
        Math.max(...allRows.map((row) => (row[colIdx] ?? "").length)),
      );

      function formatRow(row: string[], formatter?: (cell: string) => string) {
        return (
          INDENT +
          row
            .map((cell, i) => {
              const padded = cell.padEnd(colWidths[i]!);
              return formatter ? formatter(padded) : padded;
            })
            .join(COL_GAP)
        );
      }

      writer.write(formatRow(opts.headers, fmt.bold) + "\n");

      const separator =
        INDENT + colWidths.map((w) => "─".repeat(w)).join(COL_GAP);
      writer.write(fmt.dim(separator) + "\n");

      for (const row of opts.rows) {
        writer.write(formatRow(row) + "\n");
      }
    },
  };
}
