export type { DeviceRecord as Device, DeviceStatus } from "@magi/db";

export interface PairingRequest {
  id: string;
  bootstrapTokenHash: string;
  expiresAt: string;
  used: boolean;
}
