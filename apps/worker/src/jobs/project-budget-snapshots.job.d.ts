import { type ProjectBudgetSnapshotsResult } from "@budget-integration/integration-core";
export interface ProjectBudgetSnapshotsJobInput {
    companyId: string;
    organisationId: string;
    integrationSourceId?: string;
    syncRunId?: string | null;
    propertyId?: string | null;
    fiscalYear?: number | null;
}
export interface ProjectBudgetSnapshotsJobResult extends ProjectBudgetSnapshotsResult {
    success: boolean;
}
/**
 * Projects imported/canonical Entrata budget data into final budget tables.
 *
 * Source:
 * - property_budgets
 * - property_budget_gl_accounts
 * - property_budget_monthly_amounts
 *
 * Target:
 * - budget_snapshots
 * - budget_calc_lines
 *
 * Rules:
 * - WORKING_BUDGET is created only if missing.
 * - WORKING_BUDGET calc lines are inserted only during initial creation.
 * - Existing WORKING_BUDGET is never overwritten from Entrata.
 * - BUDGET is created if missing.
 * - BUDGET calc lines are upserted every sync.
 * - budget_line_details are not touched.
 */
export declare function projectBudgetSnapshotsJob(input: ProjectBudgetSnapshotsJobInput): Promise<ProjectBudgetSnapshotsJobResult>;
//# sourceMappingURL=project-budget-snapshots.job.d.ts.map