export interface SyncEntrataPropertiesJobInput {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    propertyId?: string;
    propertyIds?: string[];
    fiscalYears?: string;
    forceTransform?: boolean;
    updateFiscalConfig?: boolean | undefined;
}
export interface SyncEntrataPropertiesJobResult {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId: string;
    stagingBatchId: string;
    recordsStaged: number;
}
export interface ParsedBudgetFiscalInfo {
    fiscalYear: number | null;
    fiscalStartDateRaw: string;
    fiscalEndDateRaw: string;
    fiscalStartDate: Date;
    fiscalEndDate: Date;
    startMonth: number;
    endMonth: number;
    budgetYearType: "CALENDAR_YEAR" | "FISCAL_YEAR";
}
export declare function syncEntrataPropertiesJob(input?: SyncEntrataPropertiesJobInput): Promise<SyncEntrataPropertiesJobResult | null>;
//# sourceMappingURL=sync-entrata-properties.job.d.ts.map