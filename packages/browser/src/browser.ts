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
  }

  async navigate(url: string): Promise<PageInfo> {
    await this.cdp.send("Page.navigate", { url });
    await this.waitForLoad();
    return this.getPageInfo();
  }

  async content(): Promise<string> {
    const result = await this.cdp.send("Runtime.evaluate", {
      expression: "document.body.innerText",
      returnByValue: true,
    });
    const value = result.result as { value?: string } | undefined;
    return value?.value ?? "";
  }

  async html(): Promise<string> {
    const result = await this.cdp.send("Runtime.evaluate", {
      expression: "document.documentElement.outerHTML",
      returnByValue: true,
    });
    const value = result.result as { value?: string } | undefined;
    return value?.value ?? "";
  }

  async click(selector: string): Promise<ElementInfo> {
    const result = await this.cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { found: false };
        el.click();
        return { found: true, text: el.textContent?.trim(), tagName: el.tagName };
      })()`,
      returnByValue: true,
    });
    return (result.result as { value: ElementInfo }).value;
  }

  async type(selector: string, text: string): Promise<ElementInfo> {
    const result = await this.cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { found: false };
        el.focus();
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { found: true, tagName: el.tagName };
      })()`,
      returnByValue: true,
    });
    return (result.result as { value: ElementInfo }).value;
  }

  async screenshot(): Promise<string> {
    const result = await this.cdp.send("Page.captureScreenshot", {
      format: "png",
    });
    return result.data as string; // base64
  }

  async evaluate(expression: string): Promise<unknown> {
    const result = await this.cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    const res = result.result as { value?: unknown } | undefined;
    return res?.value;
  }

  async getPageInfo(): Promise<PageInfo> {
    const result = await this.cdp.send("Runtime.evaluate", {
      expression:
        "JSON.stringify({ url: location.href, title: document.title })",
      returnByValue: true,
    });
    const value = result.result as { value?: string } | undefined;
    return value?.value ? JSON.parse(value.value) : { url: "", title: "" };
  }

  async close(): Promise<void> {
    await this.cdp.close();
  }

  private async waitForLoad(): Promise<void> {
    await this.cdp.send("Runtime.evaluate", {
      expression: `new Promise(resolve => {
        if (document.readyState === 'complete') resolve();
        else window.addEventListener('load', resolve, { once: true });
      })`,
      awaitPromise: true,
    });
  }
}
