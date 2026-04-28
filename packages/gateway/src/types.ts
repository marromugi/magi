import type { KVProvider } from "@magi/kv";
import type {
  DeviceRepository,
  SessionRepository,
  StepRepository,
  SecretRepository,
} from "@magi/db";
import type { Sandbox } from "@magi/sandbox";
import type { LLMProvider } from "@magi/agent";

export type { Device, DeviceStatus, PairingRequest } from "@magi/auth";

export interface Env {
  ADMIN_API_KEY: string;
  kv: KVProvider;
  deviceRepository: DeviceRepository;
  sessionRepository: SessionRepository;
  stepRepository: StepRepository;
  secretRepository: SecretRepository;
  sandbox: Sandbox | null;
  llm?: LLMProvider;
}
