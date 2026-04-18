import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import path from "path";

const MIGRATIONS = [
  {
    version: 1,
    name: "create-issues",
    up: `
      CREATE TABLE IF NOT EXISTS issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('feat', 'fix', 'refactor', 'chore', 'test', 'docs')),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'interrupt')),
        status TEXT NOT NULL DEFAULT 'queue' CHECK(status IN ('queue', 'active', 'done', 'blocked')),
        depends_on TEXT NOT NULL DEFAULT '[]',
        affects TEXT NOT NULL DEFAULT '[]',
        acceptance TEXT NOT NULL,
        context TEXT,
        branch TEXT,
        commit_message TEXT,
        worktree_path TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TRIGGER IF NOT EXISTS issues_updated_at
      AFTER UPDATE ON issues
      BEGIN
        UPDATE issues SET updated_at = datetime('now', 'localtime') WHERE id = NEW.id;
      END;
    `,
  },
  {
    version: 2,
    name: "create-review-schedules",
    up: `
      CREATE TABLE IF NOT EXISTS review_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cron_expr TEXT NOT NULL,
        branch TEXT NOT NULL DEFAULT 'main',
        last_reviewed_at TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TRIGGER IF NOT EXISTS review_schedules_updated_at
      AFTER UPDATE ON review_schedules
      BEGIN
        UPDATE review_schedules SET updated_at = datetime('now', 'localtime') WHERE id = NEW.id;
      END;
    `,
  },
  {
    version: 3,
    name: "add-review-policy",
    up: `
      ALTER TABLE review_schedules ADD COLUMN prompt TEXT NOT NULL DEFAULT '';
    `,
  },
] as const;

let _db: Database | null = null;

/** DB ファイルのデフォルトパスを返す */
export function defaultDbPath(projectRoot: string): string {
  return path.join(projectRoot, ".claude", "issues.db");
}

/** SQLite 接続を取得する（シングルトン） */
export function getDb(dbPath: string): Database {
  if (_db) return _db;
  _db = new Database(dbPath);
  return _db;
}

/** 読み取り専用で接続を取得する */
export function getReadonlyDb(dbPath: string): Database {
  return new Database(dbPath, { readonly: true });
}

/** DB を閉じる */
export function closeDb(): void {
  _db?.close();
  _db = null;
}

/** マイグレーションを実行する */
export function migrate(dbPath: string): void {
  const db = getDb(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  const applied = new Set(
    db
      .query<{ version: number }, []>("SELECT version FROM _migrations")
      .all()
      .map((r) => r.version),
  );

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.exec(m.up);
    db.run("INSERT INTO _migrations (version, name) VALUES (?, ?)", [
      m.version,
      m.name,
    ]);
  }
}

/** DB が存在するかチェック */
export function dbExists(dbPath: string): boolean {
  return existsSync(dbPath);
}
