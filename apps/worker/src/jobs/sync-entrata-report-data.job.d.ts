export interface SyncEntrataReportDataJobInput {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    reportCode: string;
    filters?: Record<string, unknown> | undefined;
    /**
     * Existing name retained for compatibility.
     * These are Entrata property codes, for example ["100013236"], not internal UUID property IDs.
     * If omitted, property codes are fetched from the Property table.
     */
    propertyIds?: string[] | undefined;
    /**
     * Required for month-by-month occupancy report sync unless periodStart/periodEnd are passed.
     */
    fiscalYear?: number | undefined;
    /**
     * When true, sync fiscalYear - 1 also.
     * Useful for Beginning Occupancy Jan and LY comparison rows.
     */
    includePriorYear?: boolean | undefined;
    /**
     * Optional explicit daterange override.
     * Example: periodStart = "2026-02-23", periodEnd = "2026-03-01".
     */
    periodStart?: string | undefined;
    periodEnd?: string | undefined;
    updateFiscalConfig?: boolean | undefined;
}
export interface SyncEntrataReportDataJobResult {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId: string;
    reportRunId: string;
    reportCode: string;
    recordsReceived: number;
    recordsStaged: number;
    recordsPendingTransform: number;
    transformBatchSize: number;
    propertyCodes?: string[] | undefined;
    fiscalYear?: number | undefined;
}
export declare function syncEntrataReportDataJob(input: SyncEntrataReportDataJobInput): Promise<SyncEntrataReportDataJobResult>;
//# sourceMappingURL=sync-entrata-report-data.job.d.ts.map