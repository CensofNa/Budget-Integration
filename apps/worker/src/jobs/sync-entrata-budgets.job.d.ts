export interface SyncEntrataBudgetsJobInput {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    propertyBatchSize?: number;
    fiscalYears?: string;
    budgetIds?: string;
    budgetStatusTypeIds?: string;
    propertyId?: string;
    propertyIds?: string[] | string;
}
export interface SyncEntrataBudgetsJobResult {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId: string;
    recordsReceived: number;
    recordsStaged: number;
    recordsSkipped: number;
    recordsPendingTransform: number;
}
export declare function syncEntrataBudgetsJob(input?: SyncEntrataBudgetsJobInput): Promise<SyncEntrataBudgetsJobResult | null>;
//# sourceMappingURL=sync-entrata-budgets.job.d.ts.map