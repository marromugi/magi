import type { KVProvider } from "@magi/kv";
import type { DeviceRepository } from "@magi/db";
import type { Sandbox } from "@magi/sandbox";

export type { Device, DeviceStatus, PairingRequest } from "@magi/auth";

export interface Env {
  ADMIN_API_KEY: string;
  kv: KVProvider;
  deviceRepository: DeviceRepository;
  sandbox: Sandbox | null;
}
