import { prisma } from "@budget-integration/database";

export type StageBudgetReportJobData = {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId?: string;
  autoProcess?: boolean;
};

export async function stageBudgetReportJob(data: StageBudgetReportJobData) {
  console.log(`[StageBudgetReportJob] Staging budget reports for syncRunId: ${data.syncRunId ?? "ALL"}`);

  const stagedResult = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public.fn_stage_budget_report_from_logs(
      '${data.companyId}'::uuid,
      '${data.organisationId}'::uuid,
      '${data.integrationSourceId}'::uuid,
      ${data.syncRunId ? `'${data.syncRunId}'::uuid` : "NULL::uuid"}
    );
  `);

  if (data.autoProcess) {
    await prisma.$queryRawUnsafe(`
      SELECT * FROM public.fn_transform_budget_report(
        '${data.companyId}'::uuid,
        '${data.organisationId}'::uuid,
        '${data.integrationSourceId}'::uuid,
        ${data.syncRunId ? `'${data.syncRunId}'::uuid` : "NULL::uuid"}
      );
    `);

    await prisma.$queryRawUnsafe(`
      SELECT * FROM public.fn_project_budgets_from_master_report(
        '${data.companyId}'::uuid,
        '${data.organisationId}'::uuid,
        '${data.integrationSourceId}'::uuid,
        ${data.syncRunId ? `'${data.syncRunId}'::uuid` : "NULL::uuid"},
        NULL::uuid,
        NULL::integer
      );
    `);
  }

  return {
    syncRunId: data.syncRunId,
    stagedCount: stagedResult[0]?.staged_count ?? 0,
    autoProcessed: data.autoProcess ?? false,
  };
}
