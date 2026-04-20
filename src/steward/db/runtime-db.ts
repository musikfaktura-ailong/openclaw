import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { requireNodeSqlite } from "../../infra/node-sqlite.js";

export const STEWARD_DB_FILENAME = "steward.db";

export function resolveStewardDbPath(storePath: string): string {
  if (storePath === ":memory:") {
    return storePath;
  }
  if (storePath.endsWith(".db")) {
    return storePath;
  }
  return path.join(path.dirname(storePath), STEWARD_DB_FILENAME);
}

export function openStewardDatabase(storePath: string): {
  db: DatabaseSync;
  dbPath: string;
} {
  const dbPath = resolveStewardDbPath(storePath);
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const { DatabaseSync } = requireNodeSqlite();
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 15000;");
  db.exec("PRAGMA foreign_keys = ON;");
  return { db, dbPath };
}
