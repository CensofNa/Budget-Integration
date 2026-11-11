export interface SyncEntrataPropertiesJobInput {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    propertyId?: string;
    propertyIds?: string[];
}
export interface SyncEntrataPropertiesJobResult {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId: string;
    stagingBatchId: string;
    recordsStaged: number;
}
export declare function syncEntrataPropertiesJob(input?: SyncEntrataPropertiesJobInput): Promise<SyncEntrataPropertiesJobResult | null>;
//# sourceMappingURL=sync-entrata-properties.job.d.ts.map