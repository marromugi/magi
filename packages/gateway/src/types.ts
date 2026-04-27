import type { AuthEnv } from "@magi/auth";

export type {
  Device,
  DeviceId,
  DeviceStatus,
  TokenHash,
  PairingRequest,
} from "@magi/auth";

export interface Env extends AuthEnv {}
