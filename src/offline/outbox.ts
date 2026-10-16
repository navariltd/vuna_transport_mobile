import * as Crypto from 'expo-crypto';
import { getOfflineScope } from './cache';
import { getOfflineDatabase } from './database';

export type OfflineOperationStatus = 'Pending' | 'Syncing' | 'Failed' | 'Needs Attention' | 'Completed';

export type OfflineOperation<T = Record<string, unknown>> = {
  operationId: string;
  operationType: string;
  entityKey: string;
  payload: T;
  status: OfflineOperationStatus;
  attemptCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export async function enqueueOfflineOperation<T>(operationType: string, entityKey: string, payload: T) {
  const scope = await getOfflineScope();
  if (!scope) throw new Error('Your mobile session has expired. Please sign in again.');

  const database = await getOfflineDatabase();
  const now = new Date().toISOString();
  const operationId = Crypto.randomUUID();
  await database.runAsync(
    `INSERT INTO offline_outbox
      (operation_id, scope, operation_type, entity_key, payload, status, attempt_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'Pending', 0, ?, ?)`,
    operationId,
    scope,
    operationType,
    entityKey,
    JSON.stringify(payload),
    now,
    now,
  );
  return operationId;
}

export async function getOfflineOperation(operationId: string): Promise<OfflineOperation | null> {
  const scope = await getOfflineScope();
  if (!scope) return null;
  const database = await getOfflineDatabase();
  const row = await database.getFirstAsync<{
    operation_id: string;
    operation_type: string;
    entity_key: string;
    payload: string;
    status: OfflineOperationStatus;
    attempt_count: number;
    last_error: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT operation_id, operation_type, entity_key, payload, status, attempt_count,
            last_error, created_at, updated_at
       FROM offline_outbox
      WHERE scope = ? AND operation_id = ?`,
    scope,
    operationId,
  );
  return row ? mapOperation(row) : null;
}

export async function getActiveOfflineOperation(operationType: string, entityKey: string) {
  const scope = await getOfflineScope();
  if (!scope) return null;
  const database = await getOfflineDatabase();
  const row = await database.getFirstAsync<OfflineOperationRow>(
    `SELECT operation_id, operation_type, entity_key, payload, status, attempt_count,
            last_error, created_at, updated_at
       FROM offline_outbox
      WHERE scope = ? AND operation_type = ? AND entity_key = ? AND status != 'Completed'
      ORDER BY created_at DESC
      LIMIT 1`,
    scope,
    operationType,
    entityKey,
  );
  return row ? mapOperation(row) : null;
}

export async function getOfflineOperations(limit = 100): Promise<OfflineOperation[]> {
  const scope = await getOfflineScope();
  if (!scope) return [];
  const database = await getOfflineDatabase();
  const rows = await database.getAllAsync<OfflineOperationRow>(
    `SELECT operation_id, operation_type, entity_key, payload, status, attempt_count,
            last_error, created_at, updated_at
       FROM offline_outbox
      WHERE scope = ?
      ORDER BY CASE status
        WHEN 'Needs Attention' THEN 0
        WHEN 'Failed' THEN 1
        WHEN 'Pending' THEN 2
        WHEN 'Syncing' THEN 3
        ELSE 4 END,
        updated_at DESC
      LIMIT ?`,
    scope,
    Math.min(Math.max(limit, 1), 200),
  );
  return rows.map(mapOperation);
}

export async function getPendingOfflineOperations(limit = 50): Promise<OfflineOperation[]> {
  const scope = await getOfflineScope();
  if (!scope) return [];

  const database = await getOfflineDatabase();
  const rows = await database.getAllAsync<{
    operation_id: string;
    operation_type: string;
    entity_key: string;
    payload: string;
    status: OfflineOperationStatus;
    attempt_count: number;
    last_error: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT operation_id, operation_type, entity_key, payload, status, attempt_count,
            last_error, created_at, updated_at
       FROM offline_outbox
      WHERE scope = ? AND status IN ('Pending', 'Failed')
      ORDER BY created_at ASC
      LIMIT ?`,
    scope,
    Math.min(Math.max(limit, 1), 100),
  );
  return rows.map(mapOperation);
}

export async function updateOfflineOperation(
  operationId: string,
  values: { payload?: unknown; status?: OfflineOperationStatus; lastError?: string | null; incrementAttempts?: boolean },
) {
  const scope = await getOfflineScope();
  if (!scope) return;
  const database = await getOfflineDatabase();
  const current = await getOfflineOperation(operationId);
  if (!current) return;
  await database.runAsync(
    `UPDATE offline_outbox
        SET payload = ?, status = ?, last_error = ?, attempt_count = ?, updated_at = ?
      WHERE scope = ? AND operation_id = ?`,
    JSON.stringify(values.payload ?? current.payload),
    values.status ?? current.status,
    values.lastError === undefined ? current.lastError || null : values.lastError,
    current.attemptCount + (values.incrementAttempts ? 1 : 0),
    new Date().toISOString(),
    scope,
    operationId,
  );
}

export async function getPendingOfflineOperationCount() {
  const scope = await getOfflineScope();
  if (!scope) return 0;
  const database = await getOfflineDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM offline_outbox
      WHERE scope = ? AND status IN ('Pending', 'Syncing', 'Failed', 'Needs Attention')`,
    scope,
  );
  return row?.count || 0;
}

export async function clearCompletedOfflineOperations() {
  const scope = await getOfflineScope();
  if (!scope) return;
  const database = await getOfflineDatabase();
  await database.runAsync(
    "DELETE FROM offline_outbox WHERE scope = ? AND status = 'Completed'",
    scope,
  );
}

type OfflineOperationRow = {
  operation_id: string;
  operation_type: string;
  entity_key: string;
  payload: string;
  status: OfflineOperationStatus;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function mapOperation(row: OfflineOperationRow): OfflineOperation {
  return {
    operationId: row.operation_id,
    operationType: row.operation_type,
    entityKey: row.entity_key,
    payload: JSON.parse(row.payload),
    status: row.status,
    attemptCount: row.attempt_count,
    lastError: row.last_error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
