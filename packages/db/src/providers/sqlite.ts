import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
import type {
  DatabaseProvider,
  DeviceRepository,
  DeviceRecord,
  DeviceStatus,
} from "../types";

interface DeviceRow {
  id: string;
  name: string;
  token_hash: string;
  status: string;
  scopes: string;
  created_at: string;
  paired_at: string | null;
}

function rowToRecord(row: DeviceRow): DeviceRecord {
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
    return row ? rowToRecord(row) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<DeviceRecord | null> {
    const row = this.db
      .prepare(
        "SELECT * FROM devices WHERE token_hash = ? AND status = 'paired'",
      )
      .get(tokenHash) as DeviceRow | null;
    return row ? rowToRecord(row) : null;
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
    return rows.map(rowToRecord);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare("DELETE FROM devices WHERE id = ?").run(id);
  }
}

export class SQLiteDatabase implements DatabaseProvider {
  readonly name = "sqlite";
  readonly devices: DeviceRepository;
  private db: Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.migrate();
    this.devices = new SQLiteDeviceRepository(this.db);
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
      )
    `);
  }

  close(): void {
    this.db.close();
  }
}
