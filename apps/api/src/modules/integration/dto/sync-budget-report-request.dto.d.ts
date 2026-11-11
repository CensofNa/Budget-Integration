export declare class SyncBudgetReportRequestDto {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    budgetType?: "currentfy" | "previousfy" | string;
    fiscalYear?: number;
    targetBudgetYear?: number;
    propertyIds?: string[];
    ownerFilter?: "all" | "livano" | "non-livano";
    glTreeId?: string;
    glBookIds?: number[];
    budgetStatus?: string;
    includeZeroBalance?: boolean;
    autoProcess?: boolean;
}
//# sourceMappingURL=sync-budget-report-request.dto.d.ts.map