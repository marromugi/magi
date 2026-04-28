import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Browser } from "./browser";

// This test requires Chrome running with --remote-debugging-port=9222
// Skip if Chrome is not available
// CDP_URL can be overridden via env for custom Chrome instances

let browser: Browser;
let chromeAvailable = false;

beforeAll(async () => {
  try {
    // Check if Chrome CDP is reachable
    const res = await fetch("http://localhost:9222/json/version");
    if (res.ok) {
      const pages = await fetch("http://localhost:9222/json/list");
      const list = (await pages.json()) as Array<{
        webSocketDebuggerUrl: string;
      }>;
      if (list.length > 0 && list[0]) {
        browser = new Browser({ cdpUrl: list[0].webSocketDebuggerUrl });
        await browser.connect();
        chromeAvailable = true;
      }
    }
  } catch {
    // Chrome not running
  }
});

afterAll(async () => {
  if (chromeAvailable) {
    await browser.close();
  }
});

describe("Browser", () => {
  it("navigates to a page", async () => {
    if (!chromeAvailable) {
      console.log("Skipping: Chrome CDP not available");
      return;
    }

    const info = await browser.navigate("https://example.com");
    expect(info.title).toContain("Example");
    expect(info.url).toContain("example.com");
  });

  it("gets page content", async () => {
    if (!chromeAvailable) {
      console.log("Skipping: Chrome CDP not available");
      return;
    }

    const content = await browser.content();
    expect(content).toContain("Example Domain");
  });

  it("evaluates JavaScript", async () => {
    if (!chromeAvailable) {
      console.log("Skipping: Chrome CDP not available");
      return;
    }

    const result = await browser.evaluate("1 + 2");
    expect(result).toBe(3);
  });
});
