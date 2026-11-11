import { prisma } from "@budget-integration/database";

export type ProjectBudgetReportJobData = {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId?: string;
  propertyId?: string;
  fiscalYear?: number;
  accountCode?: string;
};

export async function projectBudgetReportJob(data: ProjectBudgetReportJobData) {
  console.log(`[ProjectBudgetReportJob] Projecting budget report calc lines for propertyId: ${data.propertyId ?? "ALL"}, FY: ${data.fiscalYear ?? 2026}`);

  const projResult = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public.fn_project_budgets_from_master_report(
      '${data.companyId}'::uuid,
      '${data.organisationId}'::uuid,
      '${data.integrationSourceId}'::uuid,
      ${data.syncRunId ? `'${data.syncRunId}'::uuid` : "NULL::uuid"},
      ${data.propertyId ? `'${data.propertyId}'::uuid` : "NULL::uuid"},
      ${data.fiscalYear ?? 2026},
      ${data.accountCode ? `'${data.accountCode}'` : "NULL"}
    );
  `);

  return {
    syncRunId: data.syncRunId,
    propertyId: data.propertyId,
    fiscalYear: data.fiscalYear ?? 2026,
    accountCode: data.accountCode,
    projectedRows: projResult,
  };
}
