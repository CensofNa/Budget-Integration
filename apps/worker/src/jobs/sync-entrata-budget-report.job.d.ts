export type SyncBudgetReportJobData = {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    fiscalYear?: number;
    budgetType?: "currentfy" | "previousfy" | string;
    targetBudgetYear?: number;
    propertyIds?: string[];
    propertyCodes?: string[];
    balanceSheetAccounts?: boolean;
    ownerFilter?: "all" | "livano" | "non-livano";
    glTreeId?: string;
    glBookIds?: number[];
    budgetStatus?: string;
    includeZeroBalance?: boolean;
    autoProcess?: boolean;
    updateFiscalConfig?: boolean;
    stream?: boolean;
    onProgress?: (message: string) => void;
};
export type SyncBudgetReportJobResult = {
    syncRunId: string;
    fiscalYear: number;
    budgetType?: string | undefined;
    targetBudgetYear: number;
    ownerFilter: string;
    glTreeId?: string | undefined;
    glBookIds?: number[] | undefined;
    propertiesFound: number;
    propertiesSynced: number;
    reportLogIds: string[];
    autoProcessed: boolean;
    stagedCount?: number;
    transformedCount?: number;
    projectedCount?: number;
};
export declare function resolveBudgetReportYears(input: {
    fiscalYear?: number;
    budgetType?: string;
    targetBudgetYear?: number;
}): {
    referenceFiscalYear: number;
    targetBudgetYear: number;
};
export declare function updatePropertyFiscalConfigFromReportPayload(propertyId: string, responsePayload: any, explicitTargetBudgetYear?: number): Promise<void>;
export declare function syncEntrataBudgetReportJob(data: SyncBudgetReportJobData): Promise<SyncBudgetReportJobResult>;
//# sourceMappingURL=sync-entrata-budget-report.job.d.ts.map