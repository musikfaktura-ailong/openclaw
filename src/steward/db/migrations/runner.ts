import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const migrationsDir = path.dirname(fileURLToPath(import.meta.url));

export function runStewardMigrations(db: DatabaseSync): void {
  const currentVersion = Number(
    (
      db.prepare("PRAGMA user_version").get() as {
        user_version?: number;
      }
    ).user_version ?? 0,
  );
  const files = fs
    .readdirSync(migrationsDir)
    .filter((entry) => /^\d+_.*\.sql$/i.test(entry))
    .sort((left, right) => left.localeCompare(right));

  let version = currentVersion;
  for (const file of files) {
    const fileVersion = Number(file.split("_", 1)[0]);
    if (!Number.isFinite(fileVersion) || fileVersion <= currentVersion) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${fileVersion}`);
      db.exec("COMMIT");
      version = fileVersion;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  if (version < currentVersion) {
    throw new Error(`steward migration version regressed: ${version} < ${currentVersion}`);
  }
}
