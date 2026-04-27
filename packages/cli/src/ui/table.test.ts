import { describe, it, expect } from "bun:test";
import { createTable } from "./table";
import { createFormat } from "./format";
import { createBufferWriter } from "./writer";

function setup(colorEnabled = false) {
  const writer = createBufferWriter();
  const fmt = createFormat(colorEnabled);
  const table = createTable(writer, fmt);
  return { writer, table };
}

describe("keyValue", () => {
  it("aligns labels and values", () => {
    const { writer, table } = setup();
    table.keyValue([
      ["Token", "abc123"],
      ["Pairing ID", "pair-1"],
      ["URL", "https://example.com"],
    ]);
    const lines = writer.output.split("\n").filter(Boolean);
    expect(lines).toEqual([
      "  Pairing ID  pair-1",
      "  Token       abc123",
      "  URL         https://example.com",
    ]);
  });

  it("handles single entry", () => {
    const { writer, table } = setup();
    table.keyValue([["Name", "device-1"]]);
    expect(writer.output).toBe("  Name  device-1\n");
  });

  it("applies formatting with color", () => {
    const { writer, table } = setup(true);
    table.keyValue([["Key", "Value"]]);
    expect(writer.output).toContain("\x1b[2m"); // dim label
    expect(writer.output).toContain("Value");
  });
});

describe("table", () => {
  it("renders headers and rows with alignment", () => {
    const { writer, table } = setup();
    table.table({
      headers: ["ID", "Name", "Status"],
      rows: [
        ["d1", "device-1", "paired"],
        ["d2", "my-phone", "revoked"],
      ],
    });
    const lines = writer.output.split("\n").filter(Boolean);
    expect(lines[0]).toBe("  ID  Name      Status ");
    expect(lines[1]).toMatch(/^ {2}─+/); // separator
    expect(lines[2]).toBe("  d1  device-1  paired ");
    expect(lines[3]).toBe("  d2  my-phone  revoked");
  });

  it("handles empty rows", () => {
    const { writer, table } = setup();
    table.table({
      headers: ["ID", "Name"],
      rows: [],
    });
    const lines = writer.output.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2); // header + separator only
  });

  it("applies header formatting with color", () => {
    const { writer, table } = setup(true);
    table.table({
      headers: ["Col"],
      rows: [["val"]],
    });
    expect(writer.output).toContain("\x1b[1m"); // bold header
  });
});
