export declare class SyncIncomeStatementActualsRequestDto {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    fiscalYear: number;
    propertyIds?: string[];
    latestPostMonth?: string;
    glTreeId?: string;
    glBookIds: number[];
    accountingMethod?: "accrual" | "cash";
    periodType?: string;
    trailingPeriods?: number;
    includeDemo?: boolean;
    autoProcess?: boolean;
    updateReforecast?: boolean;
    reforecastCutoffMonth?: string;
}
//# sourceMappingURL=sync-income-statement-actuals-request.dto.d.ts.map