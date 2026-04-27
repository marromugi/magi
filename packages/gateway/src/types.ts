import type { KVProvider } from "@magi/kv";

export type {
  Device,
  DeviceId,
  DeviceStatus,
  TokenHash,
  PairingRequest,
} from "@magi/auth";

export interface Env {
  ADMIN_API_KEY: string;
  deviceStorage: KVProvider;
}
