mod db;

use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
}

impl serde::Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

fn project_root() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[tauri::command]
pub fn list_issues() -> Result<Vec<db::Issue>, CommandError> {
    let root = project_root();
    Ok(db::list_issues(&root)?)
}

#[tauri::command]
pub fn get_issue(id: i64) -> Result<Option<db::Issue>, CommandError> {
    let root = project_root();
    Ok(db::get_issue(&root, id)?)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_issues, get_issue])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
