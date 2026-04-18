use rusqlite::{Connection, OpenFlags, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize)]
pub struct Issue {
    pub id: i64,
    pub title: String,
    #[serde(rename = "type")]
    pub issue_type: String,
    pub priority: String,
    pub status: String,
    pub depends_on: String,
    pub affects: String,
    pub acceptance: String,
    pub context: Option<String>,
    pub branch: Option<String>,
    pub commit_message: Option<String>,
    pub worktree_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn db_path(project_root: &Path) -> PathBuf {
    project_root.join(".claude").join("issues.db")
}

pub fn list_issues(project_root: &Path) -> SqlResult<Vec<Issue>> {
    let path = db_path(project_root);
    if !path.exists() {
        return Ok(vec![]);
    }
    let conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut stmt = conn.prepare(
        "SELECT id, title, type, priority, status, depends_on, affects, \
         acceptance, context, branch, commit_message, worktree_path, \
         created_at, updated_at FROM issues ORDER BY id",
    )?;
    let issues = stmt
        .query_map([], |row| {
            Ok(Issue {
                id: row.get(0)?,
                title: row.get(1)?,
                issue_type: row.get(2)?,
                priority: row.get(3)?,
                status: row.get(4)?,
                depends_on: row.get(5)?,
                affects: row.get(6)?,
                acceptance: row.get(7)?,
                context: row.get(8)?,
                branch: row.get(9)?,
                commit_message: row.get(10)?,
                worktree_path: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })?
        .collect::<SqlResult<Vec<Issue>>>()?;
    Ok(issues)
}

pub fn get_issue(project_root: &Path, id: i64) -> SqlResult<Option<Issue>> {
    let path = db_path(project_root);
    if !path.exists() {
        return Ok(None);
    }
    let conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut stmt = conn.prepare(
        "SELECT id, title, type, priority, status, depends_on, affects, \
         acceptance, context, branch, commit_message, worktree_path, \
         created_at, updated_at FROM issues WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], |row| {
        Ok(Issue {
            id: row.get(0)?,
            title: row.get(1)?,
            issue_type: row.get(2)?,
            priority: row.get(3)?,
            status: row.get(4)?,
            depends_on: row.get(5)?,
            affects: row.get(6)?,
            acceptance: row.get(7)?,
            context: row.get(8)?,
            branch: row.get(9)?,
            commit_message: row.get(10)?,
            worktree_path: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        })
    })?;
    rows.next().transpose()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup_test_db(dir: &TempDir) -> PathBuf {
        let root = dir.path().to_path_buf();
        let claude_dir = root.join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();
        let db = claude_dir.join("issues.db");
        let conn = Connection::open(&db).unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS issues (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                type TEXT NOT NULL,
                priority TEXT NOT NULL DEFAULT 'normal',
                status TEXT NOT NULL DEFAULT 'queue',
                depends_on TEXT NOT NULL DEFAULT '[]',
                affects TEXT NOT NULL DEFAULT '[]',
                acceptance TEXT NOT NULL,
                context TEXT,
                branch TEXT,
                commit_message TEXT,
                worktree_path TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO issues (title, type, priority, status, depends_on, affects, acceptance, context, branch, commit_message, worktree_path) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                "Test Issue",
                "feat",
                "normal",
                "queue",
                "[]",
                "[]",
                "acceptance criteria",
                Option::<String>::None,
                Option::<String>::None,
                Option::<String>::None,
                Option::<String>::None,
            ],
        )
        .unwrap();
        root
    }

    #[test]
    fn test_list_issues_returns_empty_when_db_missing() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        let issues = list_issues(&root).unwrap();
        assert!(issues.is_empty());
    }

    #[test]
    fn test_list_issues_returns_all_issues() {
        let dir = TempDir::new().unwrap();
        let root = setup_test_db(&dir);
        let issues = list_issues(&root).unwrap();
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].id, 1);
        assert_eq!(issues[0].title, "Test Issue");
        assert_eq!(issues[0].issue_type, "feat");
        assert_eq!(issues[0].priority, "normal");
        assert_eq!(issues[0].status, "queue");
        assert_eq!(issues[0].depends_on, "[]");
        assert_eq!(issues[0].affects, "[]");
        assert_eq!(issues[0].acceptance, "acceptance criteria");
        assert!(issues[0].context.is_none());
        assert!(issues[0].branch.is_none());
        assert!(issues[0].commit_message.is_none());
        assert!(issues[0].worktree_path.is_none());
    }

    #[test]
    fn test_get_issue_returns_none_when_db_missing() {
        let dir = TempDir::new().unwrap();
        let root = dir.path().to_path_buf();
        let issue = get_issue(&root, 1).unwrap();
        assert!(issue.is_none());
    }

    #[test]
    fn test_get_issue_returns_issue_by_id() {
        let dir = TempDir::new().unwrap();
        let root = setup_test_db(&dir);
        let issue = get_issue(&root, 1).unwrap().unwrap();
        assert_eq!(issue.id, 1);
        assert_eq!(issue.title, "Test Issue");
        assert_eq!(issue.issue_type, "feat");
    }

    #[test]
    fn test_get_issue_returns_none_for_unknown_id() {
        let dir = TempDir::new().unwrap();
        let root = setup_test_db(&dir);
        let issue = get_issue(&root, 999).unwrap();
        assert!(issue.is_none());
    }

    #[test]
    fn test_db_path_points_to_claude_dir() {
        let root = PathBuf::from("/some/project");
        let path = db_path(&root);
        assert_eq!(path, PathBuf::from("/some/project/.claude/issues.db"));
    }
}
