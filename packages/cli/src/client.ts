export interface AdminClientOptions {
  workerUrl: string;
  adminApiKey: string;
}

export class AdminClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(options: AdminClientOptions) {
    this.baseUrl = options.workerUrl.replace(/\/$/, "");
    this.apiKey = options.adminApiKey;
  }

  private async request<T>(method: string, path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error ?? `Request failed: ${res.status}`,
      );
    }
    return res.json() as Promise<T>;
  }

  async createInvite(): Promise<{
    bootstrapToken: string;
    pairingId: string;
  }> {
    return this.request("POST", "/admin/devices/invite");
  }

  async listDevices(): Promise<{
    devices: Array<{ id: string; name: string; status: string }>;
  }> {
    return this.request("GET", "/admin/devices");
  }

  async revokeDevice(deviceId: string): Promise<{ ok: boolean }> {
    return this.request("DELETE", `/admin/devices/${deviceId}`);
  }
}
