export interface DatabaseProvider {
  readonly name: string;
  devices: DeviceRepository;
  close(): void;
}

export type DeviceStatus = "paired" | "revoked";

export interface DeviceRecord {
  id: string;
  name: string;
  tokenHash: string;
  status: DeviceStatus;
  scopes: string[];
  createdAt: string;
  pairedAt: string | null;
}

export interface DeviceRepository {
  insert(device: DeviceRecord): Promise<void>;
  findById(id: string): Promise<DeviceRecord | null>;
  findByTokenHash(tokenHash: string): Promise<DeviceRecord | null>;
  updateStatus(id: string, status: DeviceStatus): Promise<void>;
  list(): Promise<DeviceRecord[]>;
  delete(id: string): Promise<void>;
}
