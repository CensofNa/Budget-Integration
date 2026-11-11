export interface BaseIntegrationJobData {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
}

export type IntegrationEntityName =
  | "Property"
  | "PropertyUnit"
  | "UnitType"
  | "Budget"
  | "GlTree"
  | "ReportData"
  | "BudgetActual"
  | "IncomeStatementActuals";

export interface SyncPropertyJobData extends BaseIntegrationJobData {
  entityName: IntegrationEntityName;
  propertyId?: string;
  propertyIds?: string[];
  propertyCodes?: string[];
  fiscalYears?: string;
  forceTransform?: boolean;
  updateFiscalConfig?: boolean | undefined;
}

export interface TransformPropertyStagingJobData extends BaseIntegrationJobData {
  syncRunId: string;
  stagingBatchId?: string;
  entityName: "Property";
  updateFiscalConfig?: boolean | undefined;
}

export interface SyncPropertyUnitJobData extends BaseIntegrationJobData {
  entityName: "PropertyUnit";
  propertyId?: string;
  propertyIds?: string[];
  propertyCodes?: string[];
  propertyBatchSize?: number;
}

export interface TransformPropertyUnitStagingJobData
  extends BaseIntegrationJobData {
  syncRunId: string;
  stagingBatchId?: string;
  entityName: "PropertyUnit";
}

export interface SyncUnitTypeJobData extends BaseIntegrationJobData {
  entityName: "UnitType";
  propertyId?: string;
  propertyIds?: string[];
  propertyCodes?: string[];
  propertyBatchSize?: number;
}

export interface TransformUnitTypeStagingJobData
  extends BaseIntegrationJobData {
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
  updateFiscalConfig?: boolean | undefined;
}

export interface TransformBudgetStagingJobData extends BaseIntegrationJobData {
  syncRunId: string;
  stagingBatchId?: string;
  entityName: "Budget";
}

export interface SyncReportDataJobData extends BaseIntegrationJobData {
  entityName: "ReportData";
  reportCode: string;
  reportName?: string | undefined;
  reportVersion?: string | undefined;
  methodVersion?: string | undefined;
  filters?: Record<string, unknown> | undefined;
  propertyIds?: string[] | undefined;
  fiscalYear?: number | undefined;
  includePriorYear?: boolean | undefined;
  periodStart?: string | undefined;
  periodEnd?: string | undefined;
  updateFiscalConfig?: boolean | undefined;
}

export interface TransformReportDataStagingJobData extends BaseIntegrationJobData {
  syncRunId: string;
  reportRunId: string;
  reportCode: string;
  batchSize?: number | undefined;
  entityName: "ReportData";
  propertyCodes?: string[] | undefined;
  propertyIds?: string[] | undefined;
  fiscalYear?: number | undefined;
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
  propertyCodes?: string[];

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
  onProgress?: (message: string) => void;
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

export interface SyncBalanceSheetActualsJobData extends BaseIntegrationJobData {
  entityName: "BalanceSheetActuals";
  syncRunId?: string | undefined;
  propertyIds?: string[] | string | undefined;
  ownerFilter?: "all" | "livano" | "non-livano" | undefined;
  fiscalYear?: number | undefined;
  trailingPeriods?: number | undefined;
  glTreeId?: string | undefined;
  glBookId?: number | string | undefined;
  accountingMethod?: string | undefined;
  autoStage?: boolean | undefined;
  autoTransform?: boolean | undefined;
  autoProject?: boolean | undefined;
  propertyCodes?: string[] | string | undefined;
  runSynchronously?: boolean | undefined;
  onProgress?: ((message: string) => void) | undefined;
}

export interface StageBalanceSheetActualsJobData extends BaseIntegrationJobData {
  entityName: "BalanceSheetActuals";
  syncRunId: string;
  reportLogId?: string | undefined;
  autoTransform?: boolean | undefined;
  autoProject?: boolean | undefined;
}

export interface TransformBalanceSheetActualsJobData extends BaseIntegrationJobData {
  entityName: "BalanceSheetActuals";
  syncRunId: string;
  autoProject?: boolean | undefined;
}

export interface ProjectBalanceSheetActualsJobData extends BaseIntegrationJobData {
  entityName: "BalanceSheetActuals";
  syncRunId?: string | undefined;
  propertyId?: string | undefined;
  fiscalYear?: number | undefined;
}

