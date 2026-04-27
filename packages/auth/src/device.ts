import type { KVProvider } from "@magi/kv";
import type { Device, PairingRequest } from "./types";
import {
  generateToken,
  generateBootstrapToken,
  hashToken,
  isBootstrapTokenExpired,
} from "./token";

const KV_PREFIX = {
  pairingRequest: "pair:",
  device: "device:",
  tokenIndex: "token:",
  deviceList: "devices:list",
} as const;

export class DeviceStore {
  constructor(private storage: KVProvider) {}

  async createInvite(options: {
    ttlMs: number;
  }): Promise<{ bootstrapToken: string; pairingId: string }> {
    const pairingId = crypto.randomUUID();
    const bootstrap = await generateBootstrapToken({ ttlMs: options.ttlMs });

    const request: PairingRequest = {
      id: pairingId,
      bootstrapTokenHash: bootstrap.tokenHash,
      expiresAt: bootstrap.expiresAt,
      used: false,
    };

    const ttlSeconds = Math.ceil(options.ttlMs / 1000) + 60;

    await this.storage.put(
      `${KV_PREFIX.pairingRequest}${pairingId}`,
      JSON.stringify(request),
      { expirationTtl: ttlSeconds },
    );

    await this.storage.put(
      `${KV_PREFIX.tokenIndex}bootstrap:${bootstrap.tokenHash}`,
      pairingId,
      { expirationTtl: ttlSeconds },
    );

    return { bootstrapToken: bootstrap.token, pairingId };
  }

  async getPairingRequest(pairingId: string): Promise<PairingRequest | null> {
    const raw = await this.storage.get(
      `${KV_PREFIX.pairingRequest}${pairingId}`,
    );
    if (!raw) return null;
    return JSON.parse(raw) as PairingRequest;
  }

  async pair(options: {
    bootstrapToken: string;
    deviceName: string;
  }): Promise<{ deviceToken: string; deviceId: string }> {
    const bootstrapHash = await hashToken(options.bootstrapToken);

    const pairingId = await this.storage.get(
      `${KV_PREFIX.tokenIndex}bootstrap:${bootstrapHash}`,
    );
    if (!pairingId) {
      throw new Error("Invalid or expired bootstrap token");
    }

    const request = await this.getPairingRequest(pairingId);
    if (
      !request ||
      request.used ||
      isBootstrapTokenExpired(request.expiresAt)
    ) {
      throw new Error("Invalid or expired bootstrap token");
    }

    request.used = true;
    await this.storage.put(
      `${KV_PREFIX.pairingRequest}${pairingId}`,
      JSON.stringify(request),
    );
    await this.storage.delete(
      `${KV_PREFIX.tokenIndex}bootstrap:${bootstrapHash}`,
    );

    const deviceId = crypto.randomUUID();
    const deviceToken = await generateToken();
    const deviceTokenHash = await hashToken(deviceToken);

    const device: Device = {
      id: deviceId,
      name: options.deviceName,
      tokenHash: deviceTokenHash,
      status: "paired",
      scopes: [],
      createdAt: new Date().toISOString(),
      pairedAt: new Date().toISOString(),
    };

    await this.storage.put(
      `${KV_PREFIX.device}${deviceId}`,
      JSON.stringify(device),
    );

    await this.storage.put(
      `${KV_PREFIX.tokenIndex}device:${deviceTokenHash}`,
      deviceId,
    );

    await this.addToDeviceList(deviceId);

    return { deviceToken, deviceId };
  }

  async validateDeviceToken(token: string): Promise<Device | null> {
    const tokenHash = await hashToken(token);
    const deviceId = await this.storage.get(
      `${KV_PREFIX.tokenIndex}device:${tokenHash}`,
    );
    if (!deviceId) return null;

    const device = await this.getDevice(deviceId);
    if (!device || device.status !== "paired") return null;

    return device;
  }

  async getDevice(deviceId: string): Promise<Device | null> {
    const raw = await this.storage.get(`${KV_PREFIX.device}${deviceId}`);
    if (!raw) return null;
    return JSON.parse(raw) as Device;
  }

  async revokeDevice(deviceId: string): Promise<void> {
    const device = await this.getDevice(deviceId);
    if (!device) return;

    await this.storage.delete(
      `${KV_PREFIX.tokenIndex}device:${device.tokenHash}`,
    );

    device.status = "revoked";
    await this.storage.put(
      `${KV_PREFIX.device}${deviceId}`,
      JSON.stringify(device),
    );
  }

  async listDevices(): Promise<Device[]> {
    const ids = await this.getDeviceList();
    const devices: Device[] = [];
    for (const id of ids) {
      const device = await this.getDevice(id);
      if (device && device.status !== "revoked") {
        devices.push(device);
      }
    }
    return devices;
  }

  private async getDeviceList(): Promise<string[]> {
    const raw = await this.storage.get(KV_PREFIX.deviceList);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  }

  private async addToDeviceList(deviceId: string): Promise<void> {
    const list = await this.getDeviceList();
    list.push(deviceId);
    await this.storage.put(KV_PREFIX.deviceList, JSON.stringify(list));
  }
}
