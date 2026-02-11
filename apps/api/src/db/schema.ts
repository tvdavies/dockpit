import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

let db: Database;

export function getDb(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export function initDb(): void {
  const dir = join(homedir(), ".dockpit");
  mkdirSync(dir, { recursive: true });

  const dbPath = join(dir, "dockpit.db");
  db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      directory TEXT NOT NULL,
      container_id TEXT,
      container_status TEXT NOT NULL DEFAULT 'not_created',
      preview_port INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS terminal_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      exec_id TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_settings (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      shell TEXT NOT NULL DEFAULT '/bin/bash',
      working_dir TEXT NOT NULL DEFAULT '/workspace',
      env_vars TEXT NOT NULL DEFAULT '{}'
    )
  `);

  // Migrations
  try { db.exec("ALTER TABLE projects ADD COLUMN github_repo TEXT"); } catch {}

  console.log("Database initialized at", dbPath);
}
