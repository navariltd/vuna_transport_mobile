import { getSession } from '../auth/session';
import { getOfflineDatabase } from './database';

export type CachedValue<T> = {
  value: T;
  updatedAt: string;
};

export async function getOfflineScope() {
  const session = await getSession();
  if (!session) return null;
  return `${session.siteUrl}|${session.user}`;
}

export async function setCachedValue<T>(namespace: string, key: string, value: T) {
  const scope = await getOfflineScope();
  if (!scope) return;

  const updatedAt = new Date().toISOString();
  const database = await getOfflineDatabase();
  await database.runAsync(
    `INSERT INTO offline_cache (scope, namespace, cache_key, payload, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(scope, namespace, cache_key)
     DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    scope,
    namespace,
    key,
    JSON.stringify(value),
    updatedAt,
  );
}

export async function getCachedValue<T>(namespace: string, key: string): Promise<CachedValue<T> | null> {
  const scope = await getOfflineScope();
  if (!scope) return null;

  const database = await getOfflineDatabase();
  const row = await database.getFirstAsync<{ payload: string; updated_at: string }>(
    `SELECT payload, updated_at
       FROM offline_cache
      WHERE scope = ? AND namespace = ? AND cache_key = ?`,
    scope,
    namespace,
    key,
  );
  if (!row) return null;

  try {
    return { value: JSON.parse(row.payload) as T, updatedAt: row.updated_at };
  } catch {
    await database.runAsync(
      'DELETE FROM offline_cache WHERE scope = ? AND namespace = ? AND cache_key = ?',
      scope,
      namespace,
      key,
    );
    return null;
  }
}

export async function clearCurrentOfflineCache() {
  const scope = await getOfflineScope();
  if (!scope) return;
  const database = await getOfflineDatabase();
  await database.runAsync('DELETE FROM offline_cache WHERE scope = ?', scope);
}
