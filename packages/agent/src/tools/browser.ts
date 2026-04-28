import { Browser } from "@magi/browser";
import type { Tool, ToolResult } from "../types";

type BrowserAction =
  | { action: "navigate"; url: string }
  | { action: "click"; selector: string }
  | { action: "type"; selector: string; text: string }
  | { action: "content"; selector?: string; search?: string }
  | { action: "screenshot" }
  | { action: "evaluate"; script: string };

export function createBrowserTool(browser: Browser): Tool {
  return {
    name: "browser",
    description: `Control a web browser. Actions:
- navigate: Open a URL. Returns page title and URL.
- click: Click an element by CSS selector.
- type: Type text into an input by CSS selector.
- content: Get text content. Use selector to narrow to specific elements, search to find text containing a keyword (returns matching lines with context).
- screenshot: Take a screenshot (returns base64 PNG).
- evaluate: Execute JavaScript in the page and return the result.

The browser maintains session state (cookies, localStorage) across actions.`,
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "navigate",
            "click",
            "type",
            "content",
            "screenshot",
            "evaluate",
          ],
          description: "The browser action to perform",
        },
        url: {
          type: "string",
          description: "URL to navigate to (for navigate action)",
        },
        selector: {
          type: "string",
          description: "CSS selector (for click, type, and content actions)",
        },
        text: {
          type: "string",
          description: "Text to type (for type action)",
        },
        search: {
          type: "string",
          description:
            "Text to search for in page content (for content action). Returns matching lines with context.",
        },
        script: {
          type: "string",
          description: "JavaScript to evaluate (for evaluate action)",
        },
      },
      required: ["action"],
    },
    async execute(input): Promise<ToolResult> {
      const action = input as unknown as BrowserAction;

      try {
        switch (action.action) {
          case "navigate": {
            const info = await browser.navigate(action.url);
            return {
              output: `Navigated to: ${info.title}\nURL: ${info.url}`,
            };
          }
          case "click": {
            const el = await browser.click(action.selector);
            if (!el.found) {
              return {
                output: `Element not found: ${action.selector}`,
                isError: true,
              };
            }
            return {
              output: `Clicked: <${el.tagName}> ${el.text ?? ""}`.trim(),
            };
          }
          case "type": {
            const el = await browser.type(action.selector, action.text);
            if (!el.found) {
              return {
                output: `Element not found: ${action.selector}`,
                isError: true,
              };
            }
            return { output: `Typed "${action.text}" into <${el.tagName}>` };
          }
          case "content": {
            const text = await browser.content({
              selector: action.selector,
              search: action.search,
            });
            return { output: text || "(empty page)" };
          }
          case "screenshot": {
            const base64 = await browser.screenshot();
            return {
              output: `Screenshot captured (${Math.round((base64.length * 0.75) / 1024)}KB). Base64 data available.`,
            };
          }
          case "evaluate": {
            const result = await browser.evaluate(action.script);
            return {
              output:
                result !== undefined
                  ? JSON.stringify(result, null, 2)
                  : "(undefined)",
            };
          }
          default:
            return {
              output: `Unknown action: ${(action as { action: string }).action}`,
              isError: true,
            };
        }
      } catch (e) {
        return {
          output: `Browser error: ${e instanceof Error ? e.message : String(e)}`,
          isError: true,
        };
      }
    },
  };
}
