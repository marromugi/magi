function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateToken(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(hash);
}

export interface BootstrapTokenResult {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

export async function generateBootstrapToken(options: {
  ttlMs: number;
}): Promise<BootstrapTokenResult> {
  const token = await generateToken();
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + options.ttlMs).toISOString();
  return { token, tokenHash, expiresAt };
}

export function isBootstrapTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}
