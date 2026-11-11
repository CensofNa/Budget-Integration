import { prisma } from "@budget-integration/database";
import { IntegrationError, projectBudgetSnapshotsFromImportedBudget } from "@budget-integration/integration-core";
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
export async function projectBudgetSnapshotsJob(input) {
    validateProjectBudgetSnapshotsJobInput(input);
    try {
        console.log("ProjectBudgetSnapshots job started", {
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,
            syncRunId: input.syncRunId,
            propertyId: input.propertyId,
            fiscalYear: input.fiscalYear
        });
        const rawResults = await prisma.$queryRaw `
      SELECT * FROM public.fn_project_budget_snapshots(
        ${input.companyId}::uuid,
        ${input.organisationId}::uuid,
        ${input.integrationSourceId ? input.integrationSourceId : null}::uuid,
        ${input.syncRunId ? input.syncRunId : null}::uuid,
        ${input.propertyId ? input.propertyId : null}::uuid,
        ${input.fiscalYear ? input.fiscalYear : null}::integer
      )
    `;
        let totalProjectedLines = 0;
        for (const row of rawResults) {
            totalProjectedLines += row.out_calc_lines_projected ?? 0;
        }
        console.log("ProjectBudgetSnapshots job completed via DB procedure", {
            processedBudgets: rawResults.length,
            totalProjectedLines
        });
        return {
            success: true,
            processedBudgets: rawResults.length,
            createdWorkingBudgetSnapshots: rawResults.length,
            skippedWorkingBudgetSnapshots: 0,
            createdBudgetSnapshots: rawResults.length,
            existingBudgetSnapshots: 0,
            insertedOrUpdatedWorkingBudgetLines: totalProjectedLines,
            insertedOrUpdatedBudgetLines: totalProjectedLines,
            skippedBudgetsWithoutFiscalYear: 0
        };
    }
    catch (error) {
        console.error("ProjectBudgetSnapshots job failed", {
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,
            syncRunId: input.syncRunId,
            propertyId: input.propertyId,
            fiscalYear: input.fiscalYear,
            error
        });
        throw new Error("Failed to project imported budget data into budget snapshots.");
        // throw new IntegrationError(
        //   "Failed to project imported budget data into budget snapshots.",
        //   "BUDGET_SNAPSHOT_PROJECTION_FAILED",
        //   IntegrationErrorCategory.Projection,
        //     true,      
        //      IntegrationErrorSeverity.High
        // );
    }
}
function validateProjectBudgetSnapshotsJobInput(input) {
    if (!input.companyId) {
        throw new Error("companyId is required for ProjectBudgetSnapshots job.");
    }
    if (!input.organisationId) {
        throw new Error("organisationId is required for ProjectBudgetSnapshots job.");
    }
}
//# sourceMappingURL=project-budget-snapshots.job.js.map