import { IntegrationError } from "../errors/integration-error.js";

export interface SyncLock {
  release(): Promise<unknown>;
}

export interface SyncLockInput {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  entityName: string;
  ttlMs?: number;
}

const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;

export function buildSyncLockKey(input: SyncLockInput): string {
  return [
    "sync-lock",
    input.companyId,
    input.organisationId,
    input.integrationSourceId,
    input.entityName
  ].join(":");
}

interface ActiveLockEntry {
  lockKey: string;
  expiresAt: number;
  lock: SyncLock;
}

const activeLocksByKey = new Map<string, ActiveLockEntry>();

export async function acquireSyncLock(input: SyncLockInput): Promise<SyncLock> {
  const lockKey = buildSyncLockKey(input);
  const now = Date.now();
  const ttlMs = input.ttlMs ?? DEFAULT_LOCK_TTL_MS;

  const existing = activeLocksByKey.get(lockKey);
  if (existing && existing.expiresAt > now) {
    throw new IntegrationError({
      message: `Another ${input.entityName} sync is already running for this integration source.`,
      code: "SYNC_LOCK_ACQUIRE_FAILED",
      category: "QUEUE_ERROR",
      retryable: true,
      severity: "WARNING",
      context: {
        lockKey,
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        entityName: input.entityName
      }
    });
  }

  const trackedLock: SyncLock = {
    async release() {
      const current = activeLocksByKey.get(lockKey);
      if (current?.lock === trackedLock) {
        activeLocksByKey.delete(lockKey);
      }
    }
  };

  activeLocksByKey.set(lockKey, {
    lockKey,
    expiresAt: now + ttlMs,
    lock: trackedLock
  });

  return trackedLock;
}

export async function releaseActiveSyncLocks(): Promise<void> {
  const entries = Array.from(activeLocksByKey.values());

  await Promise.allSettled(
    entries.map(async (entry) => {
      await entry.lock.release();
    })
  );

  activeLocksByKey.clear();
}