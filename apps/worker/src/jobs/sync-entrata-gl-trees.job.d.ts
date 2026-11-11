export interface SyncEntrataGlTreesJobInput {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    entityName?: "GlTree";
}
export interface SyncEntrataGlTreesJobResult {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId: string;
    stagingBatchId: string;
    recordsReceived: number;
    recordsStaged: number;
    recordsSkipped: number;
    recordsPendingTransform: number;
}
export declare function syncEntrataGlTreesJob(input?: SyncEntrataGlTreesJobInput): Promise<SyncEntrataGlTreesJobResult | null>;
//# sourceMappingURL=sync-entrata-gl-trees.job.d.ts.map