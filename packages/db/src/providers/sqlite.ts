import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
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
} from "../types";

// Device

interface DeviceRow {
  id: string;
  name: string;
  token_hash: string;
  status: string;
  scopes: string;
  created_at: string;
  paired_at: string | null;
}

function deviceRowToRecord(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    name: row.name,
    tokenHash: row.token_hash,
    status: row.status as DeviceStatus,
    scopes: JSON.parse(row.scopes) as string[],
    createdAt: row.created_at,
    pairedAt: row.paired_at,
  };
}

class SQLiteDeviceRepository implements DeviceRepository {
  constructor(private db: Database) {}

  async insert(device: DeviceRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO devices (id, name, token_hash, status, scopes, created_at, paired_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        device.id,
        device.name,
        device.tokenHash,
        device.status,
        JSON.stringify(device.scopes),
        device.createdAt,
        device.pairedAt,
      );
  }

  async findById(id: string): Promise<DeviceRecord | null> {
    const row = this.db
      .prepare("SELECT * FROM devices WHERE id = ?")
      .get(id) as DeviceRow | null;
    return row ? deviceRowToRecord(row) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<DeviceRecord | null> {
    const row = this.db
      .prepare(
        "SELECT * FROM devices WHERE token_hash = ? AND status = 'paired'",
      )
      .get(tokenHash) as DeviceRow | null;
    return row ? deviceRowToRecord(row) : null;
  }

  async updateStatus(id: string, status: DeviceStatus): Promise<void> {
    this.db
      .prepare("UPDATE devices SET status = ? WHERE id = ?")
      .run(status, id);
  }

  async list(): Promise<DeviceRecord[]> {
    const rows = this.db
      .prepare("SELECT * FROM devices WHERE status != 'revoked'")
      .all() as DeviceRow[];
    return rows.map(deviceRowToRecord);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare("DELETE FROM devices WHERE id = ?").run(id);
  }
}

// Session

interface SessionRow {
  id: string;
  status: string;
  system_prompt: string | null;
  created_at: string;
  updated_at: string;
}

function sessionRowToRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    status: row.status as SessionStatus,
    systemPrompt: row.system_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class SQLiteSessionRepository implements SessionRepository {
  constructor(private db: Database) {}

  async insert(session: SessionRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions (id, status, system_prompt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.status,
        session.systemPrompt,
        session.createdAt,
        session.updatedAt,
      );
  }

  async findById(id: string): Promise<SessionRecord | null> {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id) as SessionRow | null;
    return row ? sessionRowToRecord(row) : null;
  }

  async updateStatus(id: string, status: SessionStatus): Promise<void> {
    this.db
      .prepare("UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), id);
  }

  async list(): Promise<SessionRecord[]> {
    const rows = this.db
      .prepare("SELECT * FROM sessions ORDER BY created_at DESC")
      .all() as SessionRow[];
    return rows.map(sessionRowToRecord);
  }
}

// Step

interface StepRow {
  id: number;
  session_id: string;
  type: string;
  tool_name: string | null;
  tool_input: string | null;
  content: string;
  created_at: string;
}

function stepRowToRecord(row: StepRow): StepRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type as StepRecord["type"],
    toolName: row.tool_name,
    toolInput: row.tool_input,
    content: row.content,
    createdAt: row.created_at,
  };
}

class SQLiteStepRepository implements StepRepository {
  constructor(private db: Database) {}

  async insert(step: StepRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO steps (session_id, type, tool_name, tool_input, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        step.sessionId,
        step.type,
        step.toolName,
        step.toolInput,
        step.content,
        step.createdAt,
      );
  }

  async listBySessionId(sessionId: string): Promise<StepRecord[]> {
    const rows = this.db
      .prepare("SELECT * FROM steps WHERE session_id = ? ORDER BY id ASC")
      .all(sessionId) as StepRow[];
    return rows.map(stepRowToRecord);
  }
}

// Database

export class SQLiteDatabase implements DatabaseProvider {
  readonly name = "sqlite";
  readonly devices: DeviceRepository;
  readonly sessions: SessionRepository;
  readonly steps: StepRepository;
  private db: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.migrate();
    this.devices = new SQLiteDeviceRepository(this.db);
    this.sessions = new SQLiteSessionRepository(this.db);
    this.steps = new SQLiteStepRepository(this.db);
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'paired',
        scopes TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        paired_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'running',
        system_prompt TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        type TEXT NOT NULL,
        tool_name TEXT,
        tool_input TEXT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_steps_session_id ON steps(session_id);
    `);
  }

  close(): void {
    this.db.close();
  }
}
