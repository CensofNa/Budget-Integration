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
export declare function buildSyncLockKey(input: SyncLockInput): string;
export declare function acquireSyncLock(input: SyncLockInput): Promise<SyncLock>;
export declare function releaseActiveSyncLocks(): Promise<void>;
//# sourceMappingURL=distributed-sync-lock.d.ts.map