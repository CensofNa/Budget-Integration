export interface SyncEntrataPropertyUnitsJobInput {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    propertyBatchSize?: number;
    propertyId?: string;
    propertyIds?: string[];
}
export interface SyncEntrataPropertyUnitsJobResult {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId: string;
    recordsReceived: number;
    recordsStaged: number;
    recordsSkipped: number;
    recordsPendingTransform: number;
}
export declare function syncEntrataPropertyUnitsJob(input?: SyncEntrataPropertyUnitsJobInput): Promise<SyncEntrataPropertyUnitsJobResult | null>;
//# sourceMappingURL=sync-entrata-property-units.job.d.ts.map