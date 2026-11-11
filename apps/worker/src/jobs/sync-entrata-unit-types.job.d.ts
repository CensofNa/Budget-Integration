export interface SyncEntrataUnitTypesJobInput {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    propertyBatchSize?: number;
    propertyId?: string;
    propertyIds?: string[];
}
export interface SyncEntrataUnitTypesJobResult {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId: string;
    recordsReceived: number;
    recordsStaged: number;
    recordsSkipped: number;
    recordsPendingTransform: number;
}
export declare function syncEntrataUnitTypesJob(input?: SyncEntrataUnitTypesJobInput): Promise<SyncEntrataUnitTypesJobResult | null>;
//# sourceMappingURL=sync-entrata-unit-types.job.d.ts.map