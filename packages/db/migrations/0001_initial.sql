-- Migration: 0001_initial
-- Creates all initial tables for MAGI

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

CREATE TABLE IF NOT EXISTS secrets (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  placeholder TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
