import type { DatabaseSync } from "node:sqlite";
import { openStewardDatabase } from "./runtime-db.js";
import { runStewardMigrations } from "./migrations/runner.js";

let cachedDb: DatabaseSync | null = null;
let cachedPath: string | null = null;

export function initStewardDb(storePath: string): DatabaseSync {
  const { db, dbPath } = openStewardDatabase(storePath);
  if (cachedDb && cachedPath === dbPath) {
    db.close();
    return cachedDb;
  }
  if (cachedDb) {
    cachedDb.close();
  }
  runStewardMigrations(db);
  cachedDb = db;
  cachedPath = dbPath;
  return db;
}

export function getDb(): DatabaseSync {
  if (!cachedDb) {
    throw new Error("Steward DB is not initialized. Call initStewardDb(storePath) first.");
  }
  return cachedDb;
}

export function getStewardDbPath(): string {
  if (!cachedPath) {
    throw new Error("Steward DB path is not initialized. Call initStewardDb(storePath) first.");
  }
  return cachedPath;
}

export function closeStewardDb(): void {
  cachedDb?.close();
  cachedDb = null;
  cachedPath = null;
}

export function resetDbForTest(): void {
  closeStewardDb();
}
