import { Hono } from "hono";
import type { SecretRepository } from "@magi/db";

interface ProxyEnv {
  secretRepository: SecretRepository;
}

const proxy = new Hono<{ Bindings: ProxyEnv }>();

proxy.all("/*", async (c) => {
  const targetUrl = c.req.header("X-Proxy-URL");
  if (!targetUrl) {
    return c.json({ error: "X-Proxy-URL header required" }, 400);
  }

  // Read request body
  let body = await c.req.text();

  // Collect all headers
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    if (key.toLowerCase() === "x-proxy-url") return;
    if (key.toLowerCase() === "host") return;
    headers[key] = value;
  });

  // Replace placeholders in body and headers
  const secrets = await c.env.secretRepository.list();
  for (const secret of secrets) {
    body = body.replaceAll(secret.placeholder, secret.value);
    for (const [key, value] of Object.entries(headers)) {
      headers[key] = value.replaceAll(secret.placeholder, secret.value);
    }
  }

  // Forward request
  try {
    const res = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: ["GET", "HEAD"].includes(c.req.method) ? undefined : body,
    });

    // Replace real values with placeholders in response (prevent leaking)
    let resBody = await res.text();
    for (const secret of secrets) {
      resBody = resBody.replaceAll(secret.value, secret.placeholder);
    }

    return new Response(resBody, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "text/plain",
      },
    });
  } catch (e) {
    return c.json(
      { error: `Proxy error: ${e instanceof Error ? e.message : String(e)}` },
      502,
    );
  }
});

export { proxy };
