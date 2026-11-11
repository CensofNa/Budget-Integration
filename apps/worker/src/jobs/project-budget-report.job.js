import { prisma } from "@budget-integration/database";
export async function projectBudgetReportJob(data) {
    console.log(`[ProjectBudgetReportJob] Projecting budget report calc lines for propertyId: ${data.propertyId ?? "ALL"}, FY: ${data.fiscalYear ?? 2026}`);
    const projResult = await prisma.$queryRawUnsafe(`
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
//# sourceMappingURL=project-budget-report.job.js.map