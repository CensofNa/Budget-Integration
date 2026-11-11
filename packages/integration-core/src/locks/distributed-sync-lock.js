import { prisma } from "@budget-integration/database";
import { IntegrationError } from "../errors/integration-error.js";
export function buildSyncLockKey(input) {
    return [
        "sync-lock",
        input.companyId,
        input.organisationId,
        input.integrationSourceId,
        input.entityName
    ].join(":");
}
function stringToLockId(str) {
    let hash = 0n;
    for (let i = 0; i < str.length; i++) {
        const char = BigInt(str.charCodeAt(i));
        hash = (hash * 31n + char) & 0x7fffffffffffffffn;
    }
    return hash;
}
const activeLocks = new Set();
export async function acquireSyncLock(input) {
    const lockKey = buildSyncLockKey(input);
    const lockId = stringToLockId(lockKey);
    try {
        const result = await prisma.$queryRaw `
      SELECT pg_try_advisory_lock(${lockId}) as acquired
    `;
        if (!result || !result[0]?.acquired) {
            throw new Error(`Lock already held for key: ${lockKey}`);
        }
        const trackedLock = {
            async release() {
                try {
                    await prisma.$queryRaw `
            SELECT pg_advisory_unlock(${lockId})
          `;
                }
                finally {
                    activeLocks.delete(trackedLock);
                }
            }
        };
        activeLocks.add(trackedLock);
        return trackedLock;
    }
    catch (error) {
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
            },
            cause: error
        });
    }
}
export async function releaseActiveSyncLocks() {
    const locks = Array.from(activeLocks);
    await Promise.allSettled(locks.map(async (lock) => {
        await lock.release();
    }));
    activeLocks.clear();
}
//# sourceMappingURL=distributed-sync-lock.js.map