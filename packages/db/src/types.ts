export interface DatabaseProvider {
  readonly name: string;
  devices: DeviceRepository;
  sessions: SessionRepository;
  steps: StepRepository;
  secrets: SecretRepository;
  close(): void;
}

// Device

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

// Session

export type SessionStatus = "running" | "completed" | "failed" | "cancelled";

export interface SessionRecord {
  id: string;
  status: SessionStatus;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRepository {
  insert(session: SessionRecord): Promise<void>;
  findById(id: string): Promise<SessionRecord | null>;
  updateStatus(id: string, status: SessionStatus): Promise<void>;
  list(): Promise<SessionRecord[]>;
}

// Step

export type StepType = "user_message" | "tool_call" | "tool_result" | "text";

export interface StepRecord {
  id?: number;
  sessionId: string;
  type: StepType;
  toolName: string | null;
  toolInput: string | null;
  content: string;
  createdAt: string;
}

export interface StepRepository {
  insert(step: StepRecord): Promise<void>;
  listBySessionId(sessionId: string): Promise<StepRecord[]>;
}

// Secret

export interface SecretRecord {
  name: string;
  value: string;
  placeholder: string;
  createdAt: string;
}

export interface SecretRepository {
  insert(secret: SecretRecord): Promise<void>;
  findByName(name: string): Promise<SecretRecord | null>;
  findByPlaceholder(placeholder: string): Promise<SecretRecord | null>;
  list(): Promise<SecretRecord[]>;
  delete(name: string): Promise<void>;
}
