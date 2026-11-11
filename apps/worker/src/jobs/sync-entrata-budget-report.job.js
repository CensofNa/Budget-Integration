import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { EntrataReportsConnector } from "@budget-integration/connector-entrata";
export function resolveBudgetReportYears(input) {
    const currentCalYear = new Date().getUTCFullYear();
    let referenceFiscalYear;
    const normalizedBudgetType = input.budgetType?.trim().toLowerCase();
    if (normalizedBudgetType === "previousfy") {
        referenceFiscalYear = input.fiscalYear ?? (currentCalYear - 1);
    }
    else if (normalizedBudgetType === "currentfy") {
        referenceFiscalYear = input.fiscalYear ?? currentCalYear;
    }
    else {
        referenceFiscalYear = input.fiscalYear ?? currentCalYear;
    }
    const targetBudgetYear = input.targetBudgetYear ?? (referenceFiscalYear + 1);
    return { referenceFiscalYear, targetBudgetYear };
}
function toJsonObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return value;
}
function asString(value) {
    if (value === null || value === undefined)
        return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}
const MONTH_NAME_MAP = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
async function updatePropertyFiscalConfigFromReportPayload(propertyId, responsePayload, targetBudgetYear) {
    try {
        const results = responsePayload?.response?.result;
        if (!Array.isArray(results) || results.length === 0)
            return;
        const budgetRows = [];
        for (const resItem of results) {
            const rawData = resItem?.reportData;
            if (Array.isArray(rawData)) {
                budgetRows.push(...rawData);
            }
            else if (rawData && typeof rawData === "object") {
                if (Array.isArray(rawData.budget)) {
                    budgetRows.push(...rawData.budget);
                }
                else {
                    budgetRows.push(...Object.values(rawData));
                }
            }
        }
        if (budgetRows.length === 0)
            return;
        const sampleRow = budgetRows.find((row) => Object.keys(row).some((key) => /^[a-z]{3}_\d{4}$/i.test(key)));
        if (!sampleRow)
            return;
        const monthKeys = Object.keys(sampleRow).filter((key) => /^[a-z]{3}_\d{4}$/i.test(key));
        if (monthKeys.length === 0)
            return;
        const parsedMonths = monthKeys
            .map((key) => {
            const parts = key.split("_");
            if (parts.length < 2)
                return null;
            const mStr = (parts[0] ?? "").toLowerCase();
            const yNum = parseInt(parts[1] ?? "", 10);
            const mNum = MONTH_NAME_MAP[mStr];
            if (!mNum || isNaN(yNum))
                return null;
            return { key, year: yNum, month: mNum, absMonth: yNum * 12 + (mNum - 1) };
        })
            .filter((item) => Boolean(item))
            .sort((a, b) => a.absMonth - b.absMonth);
        if (parsedMonths.length === 0)
            return;
        const firstMonth = parsedMonths[0];
        const lastMonth = parsedMonths[parsedMonths.length - 1];
        const startMonth = firstMonth.month;
        const endMonth = lastMonth.month;
        // The budget from Entrata (e.g. 2026) is the reference point for creating the budget for targetBudgetYear (e.g. 2027).
        // The property's fiscal year start/end dates are saved for targetBudgetYear.
        const targetStartYear = targetBudgetYear;
        const targetEndYear = endMonth < startMonth ? targetBudgetYear + 1 : targetBudgetYear;
        const fiscalStartDate = new Date(Date.UTC(targetStartYear, startMonth - 1, 1));
        const fiscalEndDate = new Date(Date.UTC(targetEndYear, endMonth, 0));
        const budgetYearType = (startMonth === 1 ? "CALENDAR_YEAR" : "FISCAL_YEAR");
        const currentProp = await prisma.property.findUnique({
            where: { id: propertyId },
            select: {
                budgetYear: true,
                budgetYearType: true,
                fiscalYearStartMonth: true,
                fiscalYearEndMonth: true,
                fiscalYearStartDate: true,
                fiscalYearEndDate: true,
            },
        });
        const isSame = currentProp?.budgetYear === targetBudgetYear &&
            currentProp?.budgetYearType === budgetYearType &&
            currentProp?.fiscalYearStartMonth === startMonth &&
            currentProp?.fiscalYearEndMonth === endMonth &&
            currentProp?.fiscalYearStartDate?.toISOString().slice(0, 10) === fiscalStartDate.toISOString().slice(0, 10) &&
            currentProp?.fiscalYearEndDate?.toISOString().slice(0, 10) === fiscalEndDate.toISOString().slice(0, 10);
        if (isSame) {
            console.log(`[SyncBudgetReportJob] Property ${propertyId} fiscal config is unchanged ` +
                `(${budgetYearType}, targetYear=${targetBudgetYear}, start=${startMonth}, end=${endMonth}). Skipping update.`);
            return;
        }
        console.log(`[SyncBudgetReportJob] Updating Property ${propertyId} fiscal config: ` +
            `budgetYear=${targetBudgetYear}, type=${budgetYearType}, ` +
            `start=${startMonth}/${targetStartYear} (${fiscalStartDate.toISOString().split("T")[0]}), ` +
            `end=${endMonth}/${targetEndYear} (${fiscalEndDate.toISOString().split("T")[0]})`);
        await prisma.property.update({
            where: { id: propertyId },
            data: {
                budgetYear: targetBudgetYear,
                budgetYearType,
                fiscalYearStartMonth: startMonth,
                fiscalYearEndMonth: endMonth,
                fiscalYearStartDate: fiscalStartDate,
                fiscalYearEndDate: fiscalEndDate,
            },
        });
    }
    catch (err) {
        console.error(`[WARN] Failed updating property fiscal config for ${propertyId}:`, err?.message ?? err);
    }
}
/**
 * Resolves GL Tree ID:
 * - Livano properties: "1913"
 * - Non-Livano properties: "1812"
 * - Explicit glTreeId override if supplied
 */
function resolveGlTreeIdForProperty(property, explicitGlTreeId) {
    if (explicitGlTreeId?.trim()) {
        return explicitGlTreeId.trim();
    }
    const isLivano = (property.ownerName && property.ownerName.toLowerCase().includes("livano")) ||
        (property.name && property.name.toLowerCase().includes("livano"));
    return isLivano ? "1913" : "1812";
}
export async function syncEntrataBudgetReportJob(data) {
    const syncRunId = randomUUID();
    const ownerFilter = data.ownerFilter ?? "all";
    const { referenceFiscalYear, targetBudgetYear } = resolveBudgetReportYears(data);
    console.log(`================================================================================`);
    console.log(`[SyncBudgetReportJob] Starting sync run ${syncRunId}`);
    console.log(`  Budget Type        : ${data.budgetType ?? "NONE"}`);
    console.log(`  Reference FY       : ${referenceFiscalYear}`);
    console.log(`  Target Budget Year : ${targetBudgetYear}`);
    console.log(`  Owner Filter       : ${ownerFilter}`);
    console.log(`  Target Property IDs: ${data.propertyIds?.length ? data.propertyIds.join(", ") : "ALL"}`);
    console.log(`  GL Tree ID Override: ${data.glTreeId ?? "NONE (Auto: 1913 for Livano, 1812 for Non-Livano)"}`);
    console.log(`  GL Book IDs        : ${data.glBookIds?.length ? JSON.stringify(data.glBookIds) : "DEFAULT"}`);
    console.log(`  Auto Process       : ${data.autoProcess ?? false}`);
    console.log(`================================================================================`);
    // 1. Resolve properties based on owner filter
    const propWhere = {
        companyId: data.companyId,
        organisationId: data.organisationId,
    };
    if (ownerFilter === "livano") {
        propWhere.OR = [
            { ownerName: { contains: "Livano", mode: "insensitive" } },
            { name: { contains: "Livano", mode: "insensitive" } },
        ];
    }
    else if (ownerFilter === "non-livano") {
        propWhere.AND = [
            { OR: [{ ownerName: null }, { ownerName: { not: "Livano" } }] },
            { name: { not: { contains: "Livano", mode: "insensitive" } } },
        ];
    }
    if (data.propertyIds && data.propertyIds.length > 0) {
        const numericIds = data.propertyIds
            .map((id) => Number.parseInt(id, 10))
            .filter((n) => Number.isInteger(n) && n > 0);
        const propertyFilterConditions = [
            { code: { in: data.propertyIds } },
        ];
        if (numericIds.length > 0) {
            propertyFilterConditions.push({ externalId: { in: numericIds } });
        }
        if (propWhere.AND) {
            propWhere.AND.push({ OR: propertyFilterConditions });
        }
        else {
            propWhere.OR = propertyFilterConditions;
        }
    }
    const properties = await prisma.property.findMany({
        where: propWhere,
        select: { id: true, code: true, externalId: true, name: true, ownerName: true },
    });
    console.log(`[SyncBudgetReportJob] Resolved ${properties.length} target property(ies) from database.`);
    const reportLogIds = [];
    // 2. Load Entrata Integration Source config & credentials if source is available
    const source = await prisma.integrationSource.findFirst({
        where: {
            id: data.integrationSourceId,
            companyId: data.companyId,
            organisationId: data.organisationId,
            sourceType: "entrata",
            isActive: true,
        },
        include: { config: true },
    });
    if (source?.config) {
        const connectionJson = toJsonObject(source.config.connectionJson);
        const credentialsJson = toJsonObject(source.config.credentialsJson);
        const baseUrl = asString(connectionJson.baseUrl) ?? "https://apis.entrata.com";
        const orgSlug = asString(connectionJson.orgSlug);
        let apiKey;
        const apiKeyRef = asString(credentialsJson.apiKeyRef);
        if (apiKeyRef?.startsWith("env://")) {
            apiKey = process.env[apiKeyRef.replace("env://", "")];
        }
        if (!apiKey) {
            apiKey = asString(credentialsJson.apiKey) ?? undefined;
        }
        if (orgSlug && apiKey) {
            const connector = new EntrataReportsConnector({ baseUrl, orgSlug, minDelayMs: 1200 }, { apiKey });
            for (const property of properties) {
                const reportLogId = randomUUID();
                const requestId = String(Date.now());
                const sourcePropertyId = property.externalId ? String(property.externalId) : (property.code ?? "");
                const glTreeId = resolveGlTreeIdForProperty(property, data.glTreeId);
                console.log(`[SyncBudgetReportJob] Calling Entrata getReportData for property ${sourcePropertyId} (${property.name ?? "Unknown"}) [gl_tree_ids: ${glTreeId}]...`);
                const requestPayload = {
                    requestId,
                    reportName: "budget",
                    reportVersion: "1.5",
                    methodVersion: "r2",
                    filters: {
                        property_group_ids: [Number(sourcePropertyId) || sourcePropertyId],
                        gl_tree_ids: glTreeId,
                        ...(data.glBookIds && data.glBookIds.length > 0 ? { gl_book_ids: data.glBookIds } : {}),
                        budget_status: data.budgetStatus ?? "3",
                        fiscal_year: String(referenceFiscalYear),
                        budget_ids: "all",
                        balance_sheet_accounts: "0",
                        include_zero_balance: data.includeZeroBalance !== false ? "1" : "0",
                        show_net_cash_flow_groups: "0",
                        gl_account_numbers: "0",
                        consolidate_by: "no_consolidation",
                        custom_tags: [],
                        comments: "0",
                        assumptions: "0",
                        expand_by_custom_tags: "0",
                    },
                };
                try {
                    const responsePayload = await connector.fetchReportData(requestPayload);
                    const responseCode = responsePayload?.response?.code ?? 200;
                    const success = responseCode === 200;
                    if (success && property.id) {
                        await updatePropertyFiscalConfigFromReportPayload(property.id, responsePayload, targetBudgetYear);
                    }
                    await prisma.integrationReportApiLog.create({
                        data: {
                            id: reportLogId,
                            companyId: data.companyId,
                            organisationId: data.organisationId,
                            integrationSourceId: data.integrationSourceId,
                            syncRunId,
                            reportCode: "budget",
                            reportName: "budget",
                            reportVersion: "1.5",
                            methodVersion: "r2",
                            sourcePropertyId,
                            propertyId: property.id,
                            propertyCode: property.code,
                            glTreeId,
                            glBookIds: (data.glBookIds ?? []),
                            accountingMethod: "Accrual",
                            requestPayload: requestPayload,
                            responsePayload: responsePayload,
                            responseCode,
                            status: success ? "SUCCESS" : "FAILED",
                            errorMessage: success ? null : "Entrata budget report API returned non-200 response.",
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    });
                    reportLogIds.push(reportLogId);
                    console.log(`[SyncBudgetReportJob] Successfully saved report API log ${reportLogId} for property ${sourcePropertyId} (HTTP status: ${responseCode}).`);
                }
                catch (fetchErr) {
                    console.error(`[ERROR] Failed fetching Entrata budget report for property ${sourcePropertyId} (glTreeId: ${glTreeId}):`, fetchErr?.message ?? fetchErr);
                }
            }
        }
        else {
            console.warn(`[WARN] Missing Entrata orgSlug or apiKey. Skipping live API fetch.`);
        }
    }
    let stagedCount = 0;
    let transformedCount = 0;
    let projectedCount = 0;
    // 3. Auto-process 3-Stage Pipeline if enabled
    if (data.autoProcess) {
        console.log(`[SyncBudgetReportJob] Executing Stage 1 (Staging: fn_stage_budget_report_from_logs)...`);
        const stageRes = await prisma.$queryRawUnsafe(`
      SELECT * FROM public.fn_stage_budget_report_from_logs(
        '${data.companyId}'::uuid,
        '${data.organisationId}'::uuid,
        '${data.integrationSourceId}'::uuid,
        '${syncRunId}'::uuid
      );
    `);
        stagedCount = Number(stageRes?.[0]?.staged_count ?? 0);
        console.log(`[SyncBudgetReportJob] Stage 1 Completed. Staged records: ${stagedCount}`);
        console.log(`[SyncBudgetReportJob] Executing Stage 2 (Transformation: fn_transform_budget_report)...`);
        const transformRes = await prisma.$queryRawUnsafe(`
      SELECT * FROM public.fn_transform_budget_report(
        '${data.companyId}'::uuid,
        '${data.organisationId}'::uuid,
        '${data.integrationSourceId}'::uuid,
        '${syncRunId}'::uuid
      );
    `);
        transformedCount = Number(transformRes?.[0]?.transformed_count ?? 0);
        console.log(`[SyncBudgetReportJob] Stage 2 Completed. Transformed records: ${transformedCount}`);
        console.log(`[SyncBudgetReportJob] Executing Stage 3 (Projection: fn_project_budgets_from_master_report)...`);
        const projectRes = await prisma.$queryRawUnsafe(`
      SELECT * FROM public.fn_project_budgets_from_master_report(
        '${data.companyId}'::uuid,
        '${data.organisationId}'::uuid,
        '${data.integrationSourceId}'::uuid,
        '${syncRunId}'::uuid,
        NULL::uuid,
        ${referenceFiscalYear}
      );
    `);
        projectedCount = projectRes?.reduce((sum, r) => sum + Number(r.calc_lines_upserted ?? 0), 0) ?? 0;
        console.log(`[SyncBudgetReportJob] Stage 3 Completed. Upserted calc lines: ${projectedCount}`);
    }
    console.log(`================================================================================`);
    console.log(`[SyncBudgetReportJob] Sync run ${syncRunId} completed.`);
    console.log(`  Properties Synced : ${reportLogIds.length}`);
    console.log(`  Staged Count      : ${stagedCount}`);
    console.log(`  Transformed Count : ${transformedCount}`);
    console.log(`  Projected Lines   : ${projectedCount}`);
    console.log(`================================================================================`);
    return {
        syncRunId,
        fiscalYear: referenceFiscalYear,
        budgetType: data.budgetType,
        targetBudgetYear,
        ownerFilter,
        ...(data.glTreeId ? { glTreeId: data.glTreeId } : {}),
        ...(data.glBookIds ? { glBookIds: data.glBookIds } : {}),
        propertiesFound: properties.length,
        propertiesSynced: reportLogIds.length,
        reportLogIds,
        autoProcessed: data.autoProcess ?? false,
        stagedCount,
        transformedCount,
        projectedCount,
    };
}
//# sourceMappingURL=sync-entrata-budget-report.job.js.map