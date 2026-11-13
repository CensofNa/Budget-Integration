import { PrismaClient } from "@prisma/client";
export interface ProjectBudgetSnapshotsInput {
    companyId: string;
    organisationId: string;
    integrationSourceId?: string;
    syncRunId?: string | null;
    propertyId?: string | null;
    fiscalYear?: number | null;
}
export interface ProjectBudgetSnapshotsResult {
    processedBudgets: number;
    createdWorkingBudgetSnapshots: number;
    skippedWorkingBudgetSnapshots: number;
    createdBudgetSnapshots: number;
    existingBudgetSnapshots: number;
    insertedOrUpdatedWorkingBudgetLines: number;
    insertedOrUpdatedBudgetLines: number;
    skippedBudgetsWithoutFiscalYear: number;
}
/**
 * Projects imported Entrata budget data into final budget planning tables.
 *
 * Source tables:
 * - property_budgets
 * - property_budget_gl_accounts
 * - property_budget_monthly_amounts
 *
 * Target tables:
 * - budget_snapshots
 * - budget_calc_lines
 *
 * Important:
 * - WORKING_BUDGET is created and populated only once.
 * - Existing WORKING_BUDGET is never overwritten by Entrata.
 * - BUDGET is refreshed/upserted on every sync.
 * - budget_line_details are not touched here.
 */
export declare function projectBudgetSnapshotsFromImportedBudget(prisma: PrismaClient, input: ProjectBudgetSnapshotsInput): Promise<ProjectBudgetSnapshotsResult>;
//# sourceMappingURL=budget-snapshot-projection.service.d.ts.map