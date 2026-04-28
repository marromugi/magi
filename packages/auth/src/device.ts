import type { KVProvider } from "@magi/kv";
import type { DeviceRepository } from "@magi/db";
import type { Device, PairingRequest } from "./types";
import {
  generateToken,
  generateBootstrapToken,
  hashToken,
  isBootstrapTokenExpired,
} from "./token";

const KV_PREFIX = {
  pairingRequest: "pair:",
  bootstrapIndex: "token:bootstrap:",
} as const;

export interface DeviceStoreDeps {
  kv: KVProvider;
  devices: DeviceRepository;
}

export class DeviceStore {
  private kv: KVProvider;
  private devices: DeviceRepository;

  constructor(deps: DeviceStoreDeps) {
    this.kv = deps.kv;
    this.devices = deps.devices;
  }

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

    await this.kv.put(
      `${KV_PREFIX.pairingRequest}${pairingId}`,
      JSON.stringify(request),
      { expirationTtl: ttlSeconds },
    );

    await this.kv.put(
      `${KV_PREFIX.bootstrapIndex}${bootstrap.tokenHash}`,
      pairingId,
      { expirationTtl: ttlSeconds },
    );

    return { bootstrapToken: bootstrap.token, pairingId };
  }

  async getPairingRequest(pairingId: string): Promise<PairingRequest | null> {
    const raw = await this.kv.get(`${KV_PREFIX.pairingRequest}${pairingId}`);
    if (!raw) return null;
    return JSON.parse(raw) as PairingRequest;
  }

  async pair(options: {
    bootstrapToken: string;
    deviceName: string;
  }): Promise<{ deviceToken: string; deviceId: string }> {
    const bootstrapHash = await hashToken(options.bootstrapToken);

    const pairingId = await this.kv.get(
      `${KV_PREFIX.bootstrapIndex}${bootstrapHash}`,
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

    // Mark bootstrap token as used
    request.used = true;
    await this.kv.put(
      `${KV_PREFIX.pairingRequest}${pairingId}`,
      JSON.stringify(request),
    );
    await this.kv.delete(`${KV_PREFIX.bootstrapIndex}${bootstrapHash}`);

    // Create device in DB
    const deviceId = crypto.randomUUID();
    const deviceToken = await generateToken();
    const deviceTokenHash = await hashToken(deviceToken);

    await this.devices.insert({
      id: deviceId,
      name: options.deviceName,
      tokenHash: deviceTokenHash,
      status: "paired",
      scopes: [],
      createdAt: new Date().toISOString(),
      pairedAt: new Date().toISOString(),
    });

    return { deviceToken, deviceId };
  }

  async validateDeviceToken(token: string): Promise<Device | null> {
    const tokenHash = await hashToken(token);
    const device = await this.devices.findByTokenHash(tokenHash);
    if (!device || device.status !== "paired") return null;
    return device;
  }

  async getDevice(deviceId: string): Promise<Device | null> {
    return this.devices.findById(deviceId);
  }

  async revokeDevice(deviceId: string): Promise<void> {
    await this.devices.updateStatus(deviceId, "revoked");
  }

  async listDevices(): Promise<Device[]> {
    return this.devices.list();
  }
}
