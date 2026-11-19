import { PrismaClient } from "@prisma/client";
export interface ProjectBudgetActualSnapshotsInput {
    companyId: string;
    organisationId: string;
    integrationSourceId?: string;
    syncRunId?: string | null;
    propertyId?: string | null;
    fiscalYear?: number | null;
}
export interface ProjectBudgetActualSnapshotsResult {
    processedActualGroups: number;
    createdActualSnapshots: number;
    existingActualSnapshots: number;
    upsertedActualCalcLines: number;
    refreshedWorkingBudgetBaselineLines: number;
    skippedBaselineRefreshBecauseWorkingBudgetMissing: number;
    skippedActualsWithoutFiscalYear: number;
}
/**
 * Projects imported Entrata actuals into final budget planning tables.
 *
 * Source tables:
 * - property_budget_actuals
 * - property_budget_gl_accounts
 *
 * Target tables:
 * - budget_snapshots
 * - budget_calc_lines
 * - budget_calc_line_baselines
 *
 * Important:
 * - ACTUALS snapshot is created if missing.
 * - ACTUALS budget_calc_lines are refreshed every sync.
 * - WORKING_BUDGET is not created here.
 * - WORKING_BUDGET baseline is refreshed only if WORKING_BUDGET already exists.
 * - budget_line_details are not touched here.
 * - budget_line_detail_baselines are not touched here.
 */
export declare function projectBudgetActualSnapshotsFromImportedActuals(prisma: PrismaClient, input: ProjectBudgetActualSnapshotsInput): Promise<ProjectBudgetActualSnapshotsResult>;
//# sourceMappingURL=budget-actual-snapshot-projection.service.d.ts.map