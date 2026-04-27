import { describe, it, expect } from "bun:test";
import { createOutput } from "./output";
import { createFormat } from "./format";
import { createBufferWriter } from "./writer";

function setup(colorEnabled = false) {
  const writer = createBufferWriter();
  const fmt = createFormat(colorEnabled);
  const output = createOutput(writer, fmt);
  return { writer, output };
}

describe("output (no color)", () => {
  it("success prints checkmark and message", () => {
    const { writer, output } = setup();
    output.success("Done");
    expect(writer.output).toBe("✔ Done\n");
  });

  it("error prints cross and message to stderr", () => {
    const { writer, output } = setup();
    output.error("Failed");
    expect(writer.errorOutput).toBe("✖ Failed\n");
  });

  it("info prints info icon and message", () => {
    const { writer, output } = setup();
    output.info("Note");
    expect(writer.output).toBe("ℹ Note\n");
  });

  it("warn prints warning icon and message", () => {
    const { writer, output } = setup();
    output.warn("Caution");
    expect(writer.errorOutput).toBe("⚠ Caution\n");
  });

  it("empty prints dimmed message", () => {
    const { writer, output } = setup();
    output.empty("Nothing here");
    expect(writer.output).toBe("Nothing here\n");
  });

  it("header prints decorated header", () => {
    const { writer, output } = setup();
    output.header("Devices");
    expect(writer.output).toBe("── Devices ──\n");
  });

  it("newline prints blank line", () => {
    const { writer, output } = setup();
    output.newline();
    expect(writer.output).toBe("\n");
  });
});

describe("output (with color)", () => {
  it("success applies green to icon", () => {
    const { writer, output } = setup(true);
    output.success("Done");
    expect(writer.output).toContain("✔");
    expect(writer.output).toContain("Done");
    expect(writer.output).toContain("\x1b[32m");
  });

  it("error applies red to icon", () => {
    const { writer, output } = setup(true);
    output.error("Bad");
    expect(writer.errorOutput).toContain("\x1b[31m");
  });

  it("info applies blue to icon", () => {
    const { writer, output } = setup(true);
    output.info("Tip");
    expect(writer.output).toContain("\x1b[34m");
  });

  it("warn applies yellow to icon", () => {
    const { writer, output } = setup(true);
    output.warn("Watch out");
    expect(writer.errorOutput).toContain("\x1b[33m");
  });

  it("empty applies dim", () => {
    const { writer, output } = setup(true);
    output.empty("None");
    expect(writer.output).toContain("\x1b[2m");
  });

  it("header applies dim to decorations", () => {
    const { writer, output } = setup(true);
    output.header("Title");
    expect(writer.output).toContain("\x1b[2m");
    expect(writer.output).toContain("Title");
  });
});
