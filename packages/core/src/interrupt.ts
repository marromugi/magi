import { minimatch } from "minimatch";
import { getReadonlyDb, dbExists } from "./db.js";
import type { Issue } from "./issue.js";

export interface InterruptResult {
  blocked: boolean;
  issueId?: number;
  title?: string;
  reason?: string;
}

/**
 * 指定ファイルパスが active な interrupt issue の影響範囲内かチェックする。
 * @param dbPath DB ファイルパス
 * @param filePath プロジェクトルートからの相対パス
 */
export function checkInterrupt(
  dbPath: string,
  filePath: string,
): InterruptResult {
  if (!dbExists(dbPath)) return { blocked: false };

  const db = getReadonlyDb(dbPath);
  try {
    const interrupts = db
      .query<
        Pick<Issue, "id" | "title" | "affects">,
        []
      >("SELECT id, title, affects FROM issues WHERE priority = 'interrupt' AND status = 'active'")
      .all();

    if (interrupts.length === 0) return { blocked: false };

    for (const issue of interrupts) {
      let patterns: string[] = [];
      try {
        patterns = JSON.parse(issue.affects);
      } catch {
        return blocked(
          issue.id,
          issue.title,
          "全体的な割り込みタスクが進行中です",
        );
      }

      // 空配列 = 全ファイル影響
      if (patterns.length === 0) {
        return blocked(
          issue.id,
          issue.title,
          "全体的な割り込みタスクが進行中です",
        );
      }

      for (const pattern of patterns) {
        if (minimatch(filePath, pattern)) {
          return blocked(
            issue.id,
            issue.title,
            "このファイルは割り込みの影響範囲内です",
          );
        }
      }
    }

    return { blocked: false };
  } finally {
    db.close();
  }
}

function blocked(
  issueId: number,
  title: string,
  reason: string,
): InterruptResult {
  return { blocked: true, issueId, title, reason };
}
