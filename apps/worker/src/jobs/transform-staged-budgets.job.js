import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { transformEntrataBudget } from "@budget-integration/integration-core";
import { projectBudgetSnapshotsJob } from "./project-budget-snapshots.job.js";
export async function transformStagedBudgetsJob(input = {}) {
    if (!input.companyId || !input.organisationId || !input.integrationSourceId) {
        throw new Error("companyId, organisationId, and integrationSourceId are required for transformStagedBudgetsJob.");
    }
    console.log("Executing database function fn_transform_staged_budgets...", {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        syncRunId: input.syncRunId
    });
    const transformResults = await prisma.$queryRaw `
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
    const projectResults = await prisma.$queryRaw `
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
//# sourceMappingURL=transform-staged-budgets.job.js.map