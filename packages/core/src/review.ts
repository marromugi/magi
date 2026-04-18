import type { Database } from "bun:sqlite";
import { getDb } from "./db.js";

// ── Types ──

export interface ReviewSchedule {
  id: number;
  cron_expr: string;
  branch: string;
  prompt: string;
  last_reviewed_at: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface CreateReviewScheduleInput {
  cron_expr: string;
  branch?: string;
  prompt?: string;
}

export interface UpdateReviewScheduleInput {
  cron_expr?: string;
  branch?: string;
  prompt?: string;
  last_reviewed_at?: string;
  enabled?: boolean;
}

// ── Helpers ──

function db(dbPath: string): Database {
  return getDb(dbPath);
}

// ── CRUD ──

export function createReviewSchedule(
  dbPath: string,
  input: CreateReviewScheduleInput,
): ReviewSchedule {
  const d = db(dbPath);
  const result = d.run(
    `INSERT INTO review_schedules (cron_expr, branch, prompt) VALUES (?, ?, ?)`,
    [input.cron_expr, input.branch ?? "main", input.prompt ?? ""],
  );
  return getReviewSchedule(dbPath, Number(result.lastInsertRowid))!;
}

export function getReviewSchedule(
  dbPath: string,
  id: number,
): ReviewSchedule | null {
  return (
    db(dbPath)
      .query<
        ReviewSchedule,
        [number]
      >("SELECT * FROM review_schedules WHERE id = ?")
      .get(id) ?? null
  );
}

export function listReviewSchedules(dbPath: string): ReviewSchedule[] {
  return db(dbPath)
    .query<ReviewSchedule, []>("SELECT * FROM review_schedules ORDER BY id")
    .all();
}

export function updateReviewSchedule(
  dbPath: string,
  id: number,
  input: UpdateReviewScheduleInput,
): ReviewSchedule | null {
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (input.cron_expr !== undefined) {
    sets.push("cron_expr = ?");
    values.push(input.cron_expr);
  }
  if (input.branch !== undefined) {
    sets.push("branch = ?");
    values.push(input.branch);
  }
  if (input.prompt !== undefined) {
    sets.push("prompt = ?");
    values.push(input.prompt);
  }
  if (input.last_reviewed_at !== undefined) {
    sets.push("last_reviewed_at = ?");
    values.push(input.last_reviewed_at);
  }
  if (input.enabled !== undefined) {
    sets.push("enabled = ?");
    values.push(input.enabled ? 1 : 0);
  }

  if (sets.length === 0) return getReviewSchedule(dbPath, id);

  values.push(id);
  db(dbPath).run(
    `UPDATE review_schedules SET ${sets.join(", ")} WHERE id = ?`,
    values,
  );
  return getReviewSchedule(dbPath, id);
}

export function removeReviewSchedule(dbPath: string, id: number): boolean {
  const result = db(dbPath).run("DELETE FROM review_schedules WHERE id = ?", [
    id,
  ]);
  return result.changes > 0;
}

/** last_reviewed_at を現在時刻に更新する */
export function markReviewed(
  dbPath: string,
  id: number,
): ReviewSchedule | null {
  db(dbPath).run(
    "UPDATE review_schedules SET last_reviewed_at = datetime('now', 'localtime') WHERE id = ?",
    [id],
  );
  return getReviewSchedule(dbPath, id);
}
