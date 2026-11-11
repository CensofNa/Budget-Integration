export type BudgetSnapshotType =
  | "WORKING_BUDGET"
  | "BUDGET"
  | "ACTUALS";

export interface EnsureBudgetSnapshotInput {
  companyId: string;
  organisationId: string;
  propertyId: string;
  fiscalYear: number;
  snapshotType: BudgetSnapshotType;
  status: string;
  sourceSystem?: string;
  sourceBatchId?: string | null;
}

export interface EnsureBudgetSnapshotResult {
  snapshotId: string;
  wasCreated: boolean;
}

export interface ProjectBudgetSnapshotsInput {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId?: string;
  propertyId?: string;
  fiscalYear?: number;
}

export interface ProjectBudgetActualSnapshotsInput {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId?: string;
  propertyId?: string;
  fiscalYear?: number;
}