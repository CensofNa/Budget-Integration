import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { transformEntrataBudget } from "@budget-integration/domain-budget";
import { projectBudgetSnapshotsJob } from "./project-budget-snapshots.job.js";

export interface TransformStagedBudgetsJobInput {
  companyId?: string;
  organisationId?: string;
  integrationSourceId?: string;
  syncRunId?: string;
  stagingBatchId?: string;
  batchSize?: number;
}

export async function transformStagedBudgetsJob(
  input: TransformStagedBudgetsJobInput = {}
): Promise<{ transformed: number; failed: number }> {
  if (!input.companyId || !input.organisationId || !input.integrationSourceId) {
    throw new Error("companyId, organisationId, and integrationSourceId are required for transformStagedBudgetsJob.");
  }

  console.log("Executing database function fn_transform_staged_budgets...", {
    companyId: input.companyId,
    organisationId: input.organisationId,
    integrationSourceId: input.integrationSourceId,
    syncRunId: input.syncRunId
  });

  const transformResults = await prisma.$queryRaw<Array<{ transformed_count: number; failed_count: number }>>`
    SELECT * FROM public.fn_transform_staged_budgets(
      ${input.companyId}::uuid,
      ${input.organisationId}::uuid,
      ${input.integrationSourceId}::uuid,
      ${input.syncRunId ? input.syncRunId : null}::uuid
    )
  `;

  const transformed = transformResults[0]?.transformed_count ?? 0;
  const failed = transformResults[0]?.failed_count ?? 0;

  console.log("fn_transform_staged_budgets completed:", { transformed, failed });

  console.log("Executing database function fn_project_budget_snapshots...");
  const projectResults = await prisma.$queryRaw<Array<{ out_calc_lines_projected: number }>>`
    SELECT * FROM public.fn_project_budget_snapshots(
      ${input.companyId}::uuid,
      ${input.organisationId}::uuid,
      ${input.integrationSourceId}::uuid,
      ${input.syncRunId ? input.syncRunId : null}::uuid
    )
  `;

  console.log("fn_project_budget_snapshots completed. Projected batches:", projectResults.length);

  return {
    transformed,
    failed
  };
}