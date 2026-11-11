import { prisma } from "@budget-integration/database";
function toNumber(value) {
    if (value === null || value === undefined) {
        return 0;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
function normalizeUuidOrNull(value) {
    if (!value || String(value).trim() === "") {
        return null;
    }
    return String(value).trim();
}
function normalizeIntegerOrNull(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
        throw new Error(`Invalid fiscalYear: ${value}`);
    }
    return parsed;
}
export async function projectIncomeStatementActualsJob(data) {
    const syncRunId = normalizeUuidOrNull(data.syncRunId);
    const propertyId = normalizeUuidOrNull(data.propertyId);
    const fiscalYear = normalizeIntegerOrNull(data.fiscalYear);
    console.log("[INFO] IncomeStatementActuals projection started.", {
        companyId: data.companyId,
        organisationId: data.organisationId,
        integrationSourceId: data.integrationSourceId,
        syncRunId,
        propertyId,
        fiscalYear,
    });
    const rows = await prisma.$queryRaw `
    SELECT *
    FROM public.fn_project_actuals_from_income_statement_actuals(
      ${data.companyId}::uuid,
      ${data.organisationId}::uuid,
      ${data.integrationSourceId}::uuid,
      ${syncRunId}::uuid,
      ${propertyId}::uuid,
      ${fiscalYear}::integer
    )
  `;
    const results = rows.map((row) => ({
        propertyId: String(row.property_id),
        fiscalYear: toNumber(row.fiscal_year),
        snapshotId: String(row.snapshot_id),
        calcLinesUpserted: toNumber(row.calc_lines_upserted),
    }));
    const totalCalcLinesUpserted = results.reduce((sum, row) => sum + row.calcLinesUpserted, 0);
    console.log("[INFO] IncomeStatementActuals projection completed.", {
        syncRunId,
        propertyId,
        fiscalYear,
        propertyYearCount: results.length,
        totalCalcLinesUpserted,
    });
    return {
        ...(syncRunId ? { syncRunId } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(fiscalYear ? { fiscalYear } : {}),
        propertyYearCount: results.length,
        totalCalcLinesUpserted,
        results,
    };
}
//# sourceMappingURL=project-income-statement-actuals.job.js.map