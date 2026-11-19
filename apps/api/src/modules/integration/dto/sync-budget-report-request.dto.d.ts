export declare class SyncBudgetReportRequestDto {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    budgetType?: "currentfy" | "previousfy" | string;
    fiscalYear?: number;
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
    syncMode?: "SYNC" | "QUEUE" | "STREAM";
}
//# sourceMappingURL=sync-budget-report-request.dto.d.ts.map