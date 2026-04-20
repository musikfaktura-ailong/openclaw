import type { DatabaseSync } from "node:sqlite";

export function withImmediateTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function withBoundedRetries<T>(params: {
  attempts?: number;
  shouldRetry: (error: unknown) => boolean;
  run: () => T;
}): T {
  const attempts = Math.max(1, params.attempts ?? 3);
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return params.run();
    } catch (error) {
      lastError = error;
      if (!params.shouldRetry(error) || attempt === attempts - 1) {
        throw error;
      }
    }
  }
  throw lastError;
}
