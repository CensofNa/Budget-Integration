export interface BaseIntegrationJobData {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
}
export type IntegrationEntityName = "Property" | "PropertyUnit" | "UnitType" | "Budget" | "GlTree" | "ReportData" | "BudgetActual" | "IncomeStatementActuals";
export interface SyncPropertyJobData extends BaseIntegrationJobData {
    entityName: IntegrationEntityName;
    propertyId?: string;
    propertyIds?: string[];
}
export interface TransformPropertyStagingJobData extends BaseIntegrationJobData {
    syncRunId: string;
    stagingBatchId?: string;
    entityName: "Property";
}
export interface SyncPropertyUnitJobData extends BaseIntegrationJobData {
    entityName: "PropertyUnit";
    propertyId?: string;
    propertyIds?: string[];
    propertyBatchSize?: number;
}
export interface TransformPropertyUnitStagingJobData extends BaseIntegrationJobData {
    syncRunId: string;
    stagingBatchId?: string;
    entityName: "PropertyUnit";
}
export interface SyncUnitTypeJobData extends BaseIntegrationJobData {
    entityName: "UnitType";
    propertyId?: string;
    propertyIds?: string[];
    propertyBatchSize?: number;
}
export interface TransformUnitTypeStagingJobData extends BaseIntegrationJobData {
    syncRunId: string;
    stagingBatchId?: string;
    entityName: "UnitType";
}
export interface SyncBudgetJobData extends BaseIntegrationJobData {
    entityName: "Budget";
    fiscalYears?: string;
    budgetIds?: string;
    budgetStatusTypeIds?: string;
    propertyId?: string;
    propertyIds?: string[] | string;
}
export interface TransformBudgetStagingJobData extends BaseIntegrationJobData {
    syncRunId: string;
    stagingBatchId?: string;
    entityName: "Budget";
}
export interface SyncReportDataJobData extends BaseIntegrationJobData {
    entityName: "ReportData";
    reportCode: string;
    reportName?: string;
    reportVersion?: string;
    methodVersion?: string;
    filters?: Record<string, unknown>;
    propertyIds?: string[];
    fiscalYear?: number;
    includePriorYear?: boolean;
    periodStart?: string;
    periodEnd?: string;
}
export interface TransformReportDataStagingJobData extends BaseIntegrationJobData {
    syncRunId: string;
    reportRunId: string;
    reportCode: string;
    batchSize?: number;
    entityName: "ReportData";
}
export interface SyncGlTreeJobData extends BaseIntegrationJobData {
    entityName: "GlTree";
    propertyId?: string;
}
export interface TransformGlTreeStagingJobData extends BaseIntegrationJobData {
    syncRunId: string;
    stagingBatchId?: string;
    entityName: "GlTree";
}
export interface SyncBudgetActualJobData extends BaseIntegrationJobData {
    entityName: "BudgetActual";
    fiscalYears?: string;
    budgetIds?: string;
    budgetStatusTypeIds?: string;
    startPostMonth?: string;
    endPostMonth?: string;
    accountingMethod?: string;
    propertyId?: string;
}
export interface TransformBudgetActualStagingJobData extends BaseIntegrationJobData {
    syncRunId: string;
    stagingBatchId?: string;
    entityName: "BudgetActual";
}
export interface ProjectOccupancyFromReportsJobData extends BaseIntegrationJobData {
    entityName: "Occupancy";
    propertyId: string;
    budgetYear: number;
}
export interface ProjectBudgetActualSnapshotsJobData extends BaseIntegrationJobData {
    entityName: "BudgetActual";
    propertyId: string;
    fiscalYear: number;
    syncRunId?: string;
}
export interface SyncIncomeStatementActualsJobData extends BaseIntegrationJobData {
    entityName: "IncomeStatementActuals";
    syncRunId?: string;
    propertyIds?: string[];
    fiscalYear: number;
    latestPostMonth?: string;
    reportCode?: string;
    reportName?: string;
    reportVersion?: string;
    methodVersion?: string;
    glTreeId?: string;
    glBookIds?: number[];
    accountingMethod?: "accrual" | "cash";
    periodType?: "priorpm";
    trailingPeriods?: number;
    includeDemo?: boolean;
    ownerFilter?: "all" | "livano" | "non-livano";
    autoProcess?: boolean;
    updateReforecast?: boolean;
    reforecastCutoffMonth?: string;
    forceAll?: boolean;
}
export interface StageIncomeStatementActualsJobData extends BaseIntegrationJobData {
    entityName: "IncomeStatementActuals";
    syncRunId: string;
    reportLogId?: string;
    autoTransform?: boolean;
    autoProject?: boolean;
}
export interface TransformIncomeStatementActualsJobData extends BaseIntegrationJobData {
    entityName: "IncomeStatementActuals";
    syncRunId: string;
    autoProject?: boolean;
}
export interface ProjectIncomeStatementActualsJobData extends BaseIntegrationJobData {
    entityName: "IncomeStatementActuals";
    syncRunId?: string;
    propertyId?: string;
    fiscalYear?: number;
}
export interface ProcessIncomeStatementPropertyJobData extends BaseIntegrationJobData {
    entityName: "IncomeStatementActuals";
    syncRunId: string;
    sourcePropertyId: string;
    propertyId?: string;
    propertyCode?: string;
    fiscalYear: number;
    updateReforecast?: boolean;
    reforecastCutoffMonth?: string;
}
export interface ProcessIncomeStatementPropertyJobData extends BaseIntegrationJobData {
    entityName: "IncomeStatementActuals";
    syncRunId: string;
    sourcePropertyId: string;
    propertyId?: string;
    propertyCode?: string;
    fiscalYear: number;
    updateReforecast?: boolean;
    reforecastCutoffMonth?: string;
}
//# sourceMappingURL=job-types.d.ts.map