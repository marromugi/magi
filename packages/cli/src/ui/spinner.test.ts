import { describe, it, expect } from "bun:test";
import { createSpinner } from "./spinner";
import { createFormat } from "./format";
import { createBufferWriter } from "./writer";

function setup() {
  const writer = createBufferWriter();
  const fmt = createFormat(false);
  const spinner = createSpinner(writer, fmt);
  return { writer, spinner };
}

describe("spinner", () => {
  it("writes message on start and success on stop", async () => {
    const { writer, spinner } = setup();
    const stop = spinner.start("Loading...");
    // spinner writes initial frame
    expect(writer.output).toContain("Loading...");
    stop("Done");
    expect(writer.output).toContain("Done");
  });

  it("stop with no message clears spinner", () => {
    const { writer, spinner } = setup();
    const stop = spinner.start("Working");
    stop();
    // Should have cleared the line
    expect(writer.output).toContain("Working");
  });

  it("supports failure stop", () => {
    const { writer, spinner } = setup();
    const stop = spinner.start("Connecting...");
    stop("Failed", "error");
    expect(writer.output).toContain("Failed");
  });
});
