import type {
  DatabaseProvider,
  DeviceRepository,
  DeviceRecord,
  DeviceStatus,
  SessionRepository,
  SessionRecord,
  SessionStatus,
  StepRepository,
  StepRecord,
  SecretRepository,
  SecretRecord,
} from "../types";

/**
 * Cloudflare D1 database provider.
 * Wraps a D1Database binding from Cloudflare Workers.
 *
 * Usage in wrangler.jsonc:
 *   "d1_databases": [{ "binding": "MAGI_DB", "database_name": "magi", "database_id": "..." }]
 *
 * Then: new D1DatabaseProvider(env.MAGI_DB)
 *
 * Note: Migrations must be run via `wrangler d1 migrations apply`.
 */

// D1 type (minimal subset used)
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

// Device

class D1DeviceRepository implements DeviceRepository {
  constructor(private db: D1Database) {}

  async insert(device: DeviceRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO devices (id, name, token_hash, status, scopes, created_at, paired_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        device.id,
        device.name,
        device.tokenHash,
        device.status,
        JSON.stringify(device.scopes),
        device.createdAt,
        device.pairedAt,
      )
      .run();
  }

  async findById(id: string): Promise<DeviceRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM devices WHERE id = ?")
      .bind(id)
      .first<Record<string, unknown>>();
    return row ? toDeviceRecord(row) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<DeviceRecord | null> {
    const row = await this.db
      .prepare(
        "SELECT * FROM devices WHERE token_hash = ? AND status = 'paired'",
      )
      .bind(tokenHash)
      .first<Record<string, unknown>>();
    return row ? toDeviceRecord(row) : null;
  }

  async updateStatus(id: string, status: DeviceStatus): Promise<void> {
    await this.db
      .prepare("UPDATE devices SET status = ? WHERE id = ?")
      .bind(status, id)
      .run();
  }

  async list(): Promise<DeviceRecord[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM devices WHERE status != 'revoked'")
      .all<Record<string, unknown>>();
    return results.map(toDeviceRecord);
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM devices WHERE id = ?").bind(id).run();
  }
}

// Session

class D1SessionRepository implements SessionRepository {
  constructor(private db: D1Database) {}

  async insert(session: SessionRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO sessions (id, status, system_prompt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        session.id,
        session.status,
        session.systemPrompt,
        session.createdAt,
        session.updatedAt,
      )
      .run();
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .bind(id)
      .first<Record<string, unknown>>();
    return row ? toSessionRecord(row) : null;
  }

  async updateStatus(id: string, status: SessionStatus): Promise<void> {
    await this.db
      .prepare("UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?")
      .bind(status, new Date().toISOString(), id)
      .run();
  }

  async list(): Promise<SessionRecord[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM sessions ORDER BY created_at DESC")
      .all<Record<string, unknown>>();
    return results.map(toSessionRecord);
  }
}

// Step

class D1StepRepository implements StepRepository {
  constructor(private db: D1Database) {}

  async insert(step: StepRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO steps (session_id, type, tool_name, tool_input, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        step.sessionId,
        step.type,
        step.toolName,
        step.toolInput,
        step.content,
        step.createdAt,
      )
      .run();
  }

  async listBySessionId(sessionId: string): Promise<StepRecord[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM steps WHERE session_id = ? ORDER BY id ASC")
      .bind(sessionId)
      .all<Record<string, unknown>>();
    return results.map(toStepRecord);
  }
}

// Secret

class D1SecretRepository implements SecretRepository {
  constructor(private db: D1Database) {}

  async insert(secret: SecretRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO secrets (name, value, placeholder, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(secret.name, secret.value, secret.placeholder, secret.createdAt)
      .run();
  }

  async findByName(name: string): Promise<SecretRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM secrets WHERE name = ?")
      .bind(name)
      .first<Record<string, unknown>>();
    return row ? toSecretRecord(row) : null;
  }

  async findByPlaceholder(placeholder: string): Promise<SecretRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM secrets WHERE placeholder = ?")
      .bind(placeholder)
      .first<Record<string, unknown>>();
    return row ? toSecretRecord(row) : null;
  }

  async list(): Promise<SecretRecord[]> {
    const { results } = await this.db
      .prepare("SELECT * FROM secrets ORDER BY name ASC")
      .all<Record<string, unknown>>();
    return results.map(toSecretRecord);
  }

  async delete(name: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM secrets WHERE name = ?")
      .bind(name)
      .run();
  }
}

// Database

export class D1DatabaseProvider implements DatabaseProvider {
  readonly name = "d1";
  readonly devices: DeviceRepository;
  readonly sessions: SessionRepository;
  readonly steps: StepRepository;
  readonly secrets: SecretRepository;

  constructor(db: D1Database) {
    this.devices = new D1DeviceRepository(db);
    this.sessions = new D1SessionRepository(db);
    this.steps = new D1StepRepository(db);
    this.secrets = new D1SecretRepository(db);
  }

  close(): void {
    // D1 connections are managed by Cloudflare
  }
}

// Row → Record mappers

function toDeviceRecord(row: Record<string, unknown>): DeviceRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    tokenHash: row.token_hash as string,
    status: row.status as DeviceStatus,
    scopes: JSON.parse(row.scopes as string) as string[],
    createdAt: row.created_at as string,
    pairedAt: (row.paired_at as string) ?? null,
  };
}

function toSessionRecord(row: Record<string, unknown>): SessionRecord {
  return {
    id: row.id as string,
    status: row.status as SessionStatus,
    systemPrompt: (row.system_prompt as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toStepRecord(row: Record<string, unknown>): StepRecord {
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    type: row.type as StepRecord["type"],
    toolName: (row.tool_name as string) ?? null,
    toolInput: (row.tool_input as string) ?? null,
    content: row.content as string,
    createdAt: row.created_at as string,
  };
}

function toSecretRecord(row: Record<string, unknown>): SecretRecord {
  return {
    name: row.name as string,
    value: row.value as string,
    placeholder: row.placeholder as string,
    createdAt: row.created_at as string,
  };
}
