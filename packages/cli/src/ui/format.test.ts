import { describe, it, expect } from "bun:test";
import { createFormat } from "./format";

describe("format (color enabled)", () => {
  const fmt = createFormat(true);

  it("applies bold", () => {
    const result = fmt.bold("hello");
    expect(result).toContain("hello");
    expect(result).not.toBe("hello");
  });

  it("applies dim", () => {
    const result = fmt.dim("faded");
    expect(result).toContain("faded");
    expect(result).not.toBe("faded");
  });

  it("applies green", () => {
    const result = fmt.green("success");
    expect(result).toContain("success");
    expect(result).not.toBe("success");
  });

  it("applies red", () => {
    const result = fmt.red("error");
    expect(result).toContain("error");
    expect(result).not.toBe("error");
  });

  it("applies yellow", () => {
    const result = fmt.yellow("warn");
    expect(result).toContain("warn");
    expect(result).not.toBe("warn");
  });

  it("applies blue", () => {
    const result = fmt.blue("info");
    expect(result).toContain("info");
    expect(result).not.toBe("info");
  });

  it("applies cyan", () => {
    const result = fmt.cyan("highlight");
    expect(result).toContain("highlight");
    expect(result).not.toBe("highlight");
  });
});

describe("format (color disabled)", () => {
  const fmt = createFormat(false);

  it("returns plain text for bold", () => {
    expect(fmt.bold("hello")).toBe("hello");
  });

  it("returns plain text for dim", () => {
    expect(fmt.dim("faded")).toBe("faded");
  });

  it("returns plain text for green", () => {
    expect(fmt.green("success")).toBe("success");
  });

  it("returns plain text for all colors", () => {
    expect(fmt.red("a")).toBe("a");
    expect(fmt.yellow("b")).toBe("b");
    expect(fmt.blue("c")).toBe("c");
    expect(fmt.cyan("d")).toBe("d");
  });
});
