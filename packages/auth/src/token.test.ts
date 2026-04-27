import { describe, it, expect } from "bun:test";
import {
  generateToken,
  hashToken,
  generateBootstrapToken,
  isBootstrapTokenExpired,
} from "./token";

describe("generateToken", () => {
  it("generates a 64-character hex string", async () => {
    const token = await generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique tokens", async () => {
    const a = await generateToken();
    const b = await generateToken();
    expect(a).not.toBe(b);
  });
});

describe("hashToken", () => {
  it("returns a consistent SHA-256 hex hash", async () => {
    const token = "abc123";
    const hash1 = await hashToken(token);
    const hash2 = await hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different tokens produce different hashes", async () => {
    const a = await hashToken("token-a");
    const b = await hashToken("token-b");
    expect(a).not.toBe(b);
  });
});

describe("generateBootstrapToken", () => {
  it("returns a token and expiration", async () => {
    const result = await generateBootstrapToken({ ttlMs: 60_000 });
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(result.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("respects custom TTL", async () => {
    const ttlMs = 5_000;
    const before = Date.now();
    const result = await generateBootstrapToken({ ttlMs });
    const expiresAt = new Date(result.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + ttlMs - 100);
    expect(expiresAt).toBeLessThanOrEqual(before + ttlMs + 100);
  });
});

describe("isBootstrapTokenExpired", () => {
  it("returns false for a future expiration", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isBootstrapTokenExpired(future)).toBe(false);
  });

  it("returns true for a past expiration", () => {
    const past = new Date(Date.now() - 1_000).toISOString();
    expect(isBootstrapTokenExpired(past)).toBe(true);
  });
});
