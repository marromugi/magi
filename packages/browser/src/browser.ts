import { CDPClient } from "./cdp";

export interface BrowserConfig {
  cdpUrl: string;
}

export interface PageInfo {
  url: string;
  title: string;
}

export interface ElementInfo {
  found: boolean;
  text?: string;
  tagName?: string;
}

export class Browser {
  private cdp: CDPClient;
  private config: BrowserConfig;

  constructor(config: BrowserConfig) {
    this.config = config;
    this.cdp = new CDPClient();
  }

  async connect(): Promise<void> {
    await this.cdp.connect(this.config.cdpUrl);
    await this.cdp.send("Page.enable");
    await this.cdp.send("Runtime.enable");
    await this.cdp.send("Network.enable");
    await this.cdp.send("Page.setLifecycleEventsEnabled", { enabled: true });
  }

  async navigate(url: string): Promise<PageInfo> {
    // Listen for load event before navigating
    const loaded = this.waitForLifecycleEvent("load");
    await this.cdp.send("Page.navigate", { url });
    await loaded;
    // Small delay for JS-heavy pages
    await sleep(500);
    return this.getPageInfo();
  }

  async content(options?: {
    selector?: string;
    search?: string;
  }): Promise<string> {
    const selectorJson = JSON.stringify(options?.selector ?? "");
    const searchJson = JSON.stringify(options?.search ?? "");

    return this.safeEvaluate(`(() => {
      const sel = ${selectorJson};
      const query = ${searchJson};

      // 1. Pick root elements
      let els;
      if (sel) {
        els = Array.from(document.querySelectorAll(sel));
        if (els.length === 0) return "(no elements matched selector)";
      } else {
        const main = document.querySelector('main')
          || document.querySelector('article')
          || document.querySelector('[role="main"]');
        els = [main || document.body];
      }

      // 2. Get text
      const text = els.map(el => el.innerText.trim()).filter(Boolean).join("\\n\\n");

      // 3. Text search
      if (query) {
        const lower = query.toLowerCase();
        const lines = text.split("\\n").filter(l => l.trim());
        const matched = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(lower)) {
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length, i + 3);
            matched.push(lines.slice(start, end).join("\\n"));
          }
        }
        if (matched.length === 0) return "(no text matched: " + query + ")";
        return [...new Set(matched)].join("\\n---\\n");
      }

      return text;
    })()`) as Promise<string>;
  }

  async html(): Promise<string> {
    return this.safeEvaluate(
      "document.documentElement.outerHTML",
    ) as Promise<string>;
  }

  async click(selector: string): Promise<ElementInfo> {
    const result = await this.safeEvaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return JSON.stringify({ found: false });
      el.click();
      return JSON.stringify({ found: true, text: el.textContent?.trim().slice(0, 100), tagName: el.tagName });
    })()`);
    return JSON.parse(result as string) as ElementInfo;
  }

  async type(selector: string, text: string): Promise<ElementInfo> {
    const result = await this.safeEvaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return JSON.stringify({ found: false });
      el.focus();
      el.value = ${JSON.stringify(text)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return JSON.stringify({ found: true, tagName: el.tagName });
    })()`);
    return JSON.parse(result as string) as ElementInfo;
  }

  async screenshot(): Promise<string> {
    const result = await this.cdp.send("Page.captureScreenshot", {
      format: "png",
    });
    return result.data as string;
  }

  async evaluate(expression: string): Promise<unknown> {
    return this.safeEvaluate(expression);
  }

  async getPageInfo(): Promise<PageInfo> {
    const result = await this.safeEvaluate(
      "JSON.stringify({ url: location.href, title: document.title })",
    );
    return result
      ? (JSON.parse(result as string) as PageInfo)
      : { url: "", title: "" };
  }

  async close(): Promise<void> {
    await this.cdp.close();
  }

  private async safeEvaluate(
    expression: string,
    retries = 3,
  ): Promise<unknown> {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await this.cdp.send("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        const res = result.result as { value?: unknown } | undefined;
        return res?.value ?? "";
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Retry on context/target errors (happens during navigation)
        if (
          msg.includes("Cannot find context") ||
          msg.includes("Inspected target") ||
          msg.includes("Execution context")
        ) {
          await sleep(500);
          continue;
        }
        throw e;
      }
    }
    throw new Error("Failed to evaluate after retries");
  }

  private waitForLifecycleEvent(
    eventName: string,
    timeoutMs = 30000,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for ${eventName}`));
      }, timeoutMs);

      this.cdp.on("Page.lifecycleEvent", (params) => {
        const event = params as { name: string };
        if (event.name === eventName) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
