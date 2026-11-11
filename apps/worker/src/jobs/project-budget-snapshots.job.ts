import { prisma } from "@budget-integration/database";

import { IntegrationError } from "@budget-integration/integration-core";
import {
  projectBudgetSnapshotsFromImportedBudget,
  type ProjectBudgetSnapshotsInput,
  type ProjectBudgetSnapshotsResult
} from "@budget-integration/domain-budget";

export interface ProjectBudgetSnapshotsJobInput {
  companyId: string;
  organisationId: string;
  integrationSourceId?: string;
  syncRunId?: string | null;
  propertyId?: string | null;
  fiscalYear?: number | null;
}

export interface ProjectBudgetSnapshotsJobResult
  extends ProjectBudgetSnapshotsResult {
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
export async function projectBudgetSnapshotsJob(
  input: ProjectBudgetSnapshotsJobInput
): Promise<ProjectBudgetSnapshotsJobResult> {
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

    const rawResults = await prisma.$queryRaw<Array<{
      out_property_id: string;
      out_fiscal_year: number;
      out_working_snapshot_id: string;
      out_budget_snapshot_id: string;
      out_calc_lines_projected: number;
    }>>`
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
  } catch (error) {
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

function validateProjectBudgetSnapshotsJobInput(
  input: ProjectBudgetSnapshotsJobInput
): void {
  if (!input.companyId) {
    throw new Error("companyId is required for ProjectBudgetSnapshots job.");
  }

  if (!input.organisationId) {
    throw new Error("organisationId is required for ProjectBudgetSnapshots job.");
  }
}