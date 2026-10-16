import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'vuna_transport_mobile.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getOfflineDatabase() {
  if (!databasePromise) databasePromise = openDatabase();
  return databasePromise;
}

async function openDatabase() {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS offline_cache (
      scope TEXT NOT NULL,
      namespace TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope, namespace, cache_key)
    );

    CREATE TABLE IF NOT EXISTS offline_outbox (
      operation_id TEXT PRIMARY KEY NOT NULL,
      scope TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS offline_outbox_scope_status
      ON offline_outbox (scope, status, created_at);

    UPDATE offline_outbox SET status = 'Pending' WHERE status = 'Syncing';
  `);
  return database;
}
