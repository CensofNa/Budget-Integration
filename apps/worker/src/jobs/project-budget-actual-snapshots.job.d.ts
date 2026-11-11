import { type ProjectBudgetActualSnapshotsResult } from "@budget-integration/integration-core";
export interface ProjectBudgetActualSnapshotsJobInput {
    companyId: string;
    organisationId: string;
    integrationSourceId?: string;
    syncRunId?: string | null;
    propertyId?: string | null;
    fiscalYear?: number | null;
}
export interface ProjectBudgetActualSnapshotsJobResult extends ProjectBudgetActualSnapshotsResult {
    success: boolean;
}
/**
 * Projects imported Entrata actuals (property_budget_actuals) into final budget
 * planning tables.
 *
 * Target:
 * - budget_snapshots (snapshot_type = ACTUALS)
 * - budget_calc_lines (snapshot_type = ACTUALS)
 * - budget_calc_line_baselines (only if WORKING_BUDGET already exists)
 */
export declare function projectBudgetActualSnapshotsJob(input: ProjectBudgetActualSnapshotsJobInput): Promise<ProjectBudgetActualSnapshotsJobResult>;
//# sourceMappingURL=project-budget-actual-snapshots.job.d.ts.map