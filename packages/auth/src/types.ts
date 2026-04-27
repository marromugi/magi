export type DeviceId = string;
export type TokenHash = string;

export type DeviceStatus = "pending" | "paired" | "revoked";

export interface Device {
  id: DeviceId;
  name: string;
  tokenHash: TokenHash;
  status: DeviceStatus;
  scopes: string[];
  createdAt: string;
  pairedAt: string | null;
}

export interface PairingRequest {
  id: string;
  bootstrapTokenHash: TokenHash;
  expiresAt: string;
  used: boolean;
}
