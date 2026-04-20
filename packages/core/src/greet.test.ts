import { describe, test, expect } from "bun:test";
import { greet } from "./greet.js";

describe("greet", () => {
  test("returns greeting with given name", () => {
    expect(greet("world")).toBe("Hello, world!");
  });
});
