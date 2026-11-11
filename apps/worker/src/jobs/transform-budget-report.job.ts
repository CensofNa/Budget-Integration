import { prisma } from "@budget-integration/database";

export type TransformBudgetReportJobData = {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId?: string;
  autoProcess?: boolean;
};

export async function transformBudgetReportJob(data: TransformBudgetReportJobData) {
  console.log(`[TransformBudgetReportJob] Transforming budget reports for syncRunId: ${data.syncRunId ?? "ALL"}`);

  const transformResult = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public.fn_transform_budget_report(
      '${data.companyId}'::uuid,
      '${data.organisationId}'::uuid,
      '${data.integrationSourceId}'::uuid,
      ${data.syncRunId ? `'${data.syncRunId}'::uuid` : "NULL::uuid"}
    );
  `);

  if (data.autoProcess) {
    await prisma.$queryRawUnsafe(`
      SELECT * FROM public.fn_project_budgets_from_master_report(
        '${data.companyId}'::uuid,
        '${data.organisationId}'::uuid,
        '${data.integrationSourceId}'::uuid,
        ${data.syncRunId ? `'${data.syncRunId}'::uuid` : "NULL::uuid"},
        NULL::uuid,
        2026
      );
    `);
  }

  return {
    syncRunId: data.syncRunId,
    transformedCount: transformResult[0]?.transformed_count ?? 0,
    failedCount: transformResult[0]?.failed_count ?? 0,
    autoProcessed: data.autoProcess ?? false,
  };
}
