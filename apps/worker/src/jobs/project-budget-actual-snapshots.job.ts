import { prisma } from "@budget-integration/database";

import {
  projectBudgetActualSnapshotsFromImportedActuals,
  type ProjectBudgetActualSnapshotsInput,
  type ProjectBudgetActualSnapshotsResult
} from "@budget-integration/domain-budget";

export interface ProjectBudgetActualSnapshotsJobInput {
  companyId: string;
  organisationId: string;
  integrationSourceId?: string;
  syncRunId?: string | null;
  propertyId?: string | null;
  fiscalYear?: number | null;
}

export interface ProjectBudgetActualSnapshotsJobResult
  extends ProjectBudgetActualSnapshotsResult {
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
export async function projectBudgetActualSnapshotsJob(
  input: ProjectBudgetActualSnapshotsJobInput
): Promise<ProjectBudgetActualSnapshotsJobResult> {
  validateProjectBudgetActualSnapshotsJobInput(input);

  try {
    console.log("ProjectBudgetActualSnapshots job started", {
      companyId: input.companyId,
      organisationId: input.organisationId,
      integrationSourceId: input.integrationSourceId,
      syncRunId: input.syncRunId,
      propertyId: input.propertyId,
      fiscalYear: input.fiscalYear
    });

    const projectionInput: ProjectBudgetActualSnapshotsInput = {
      companyId: input.companyId,
      organisationId: input.organisationId,
      integrationSourceId: input.integrationSourceId ?? "",
      syncRunId: input.syncRunId || null,
      propertyId: input.propertyId || null,
      fiscalYear: input.fiscalYear || new Date().getFullYear()
    };

    const result = await projectBudgetActualSnapshotsFromImportedActuals(
      prisma,
      projectionInput
    );

    console.log("ProjectBudgetActualSnapshots job completed", {
      companyId: input.companyId,
      organisationId: input.organisationId,
      integrationSourceId: input.integrationSourceId,
      syncRunId: input.syncRunId,
      propertyId: input.propertyId,
      fiscalYear: input.fiscalYear,
      processedActualGroups: result.processedActualGroups,
      createdActualSnapshots: result.createdActualSnapshots,
      existingActualSnapshots: result.existingActualSnapshots,
      upsertedActualCalcLines: result.upsertedActualCalcLines,
      refreshedWorkingBudgetBaselineLines: result.refreshedWorkingBudgetBaselineLines,
      skippedBaselineRefreshBecauseWorkingBudgetMissing:
        result.skippedBaselineRefreshBecauseWorkingBudgetMissing,
      skippedActualsWithoutFiscalYear: result.skippedActualsWithoutFiscalYear
    });

    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error("ProjectBudgetActualSnapshots job failed", {
      companyId: input.companyId,
      organisationId: input.organisationId,
      integrationSourceId: input.integrationSourceId,
      syncRunId: input.syncRunId,
      propertyId: input.propertyId,
      fiscalYear: input.fiscalYear,
      error
    });

    throw new Error("Failed to project imported BudgetActual data into budget snapshots.");
  }
}

function validateProjectBudgetActualSnapshotsJobInput(
  input: ProjectBudgetActualSnapshotsJobInput
): void {
  if (!input.companyId) {
    throw new Error("companyId is required for ProjectBudgetActualSnapshots job.");
  }

  if (!input.organisationId) {
    throw new Error("organisationId is required for ProjectBudgetActualSnapshots job.");
  }
}
