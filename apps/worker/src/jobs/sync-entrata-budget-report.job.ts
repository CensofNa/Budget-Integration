import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { EntrataReportsConnector } from "@budget-integration/connector-entrata";
import { resolveSystemAdminUserId } from "@budget-integration/integration-core";

export type SyncBudgetReportJobData = {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  fiscalYear?: number;
  budgetType?: "currentfy" | "previousfy" | string;
  targetBudgetYear?: number;
  propertyIds?: string[];
  propertyCodes?: string[];
  balanceSheetAccounts?: boolean;
  ownerFilter?: "all" | "livano" | "non-livano";
  glTreeId?: string;
  glBookIds?: number[];
  budgetStatus?: string;
  includeZeroBalance?: boolean;
  autoProcess?: boolean;
  updateFiscalConfig?: boolean;
  stream?: boolean;
  onProgress?: (message: string) => void;
};

export type SyncBudgetReportJobResult = {
  syncRunId: string;
  fiscalYear: number;
  budgetType?: string | undefined;
  targetBudgetYear: number;
  ownerFilter: string;
  glTreeId?: string | undefined;
  glBookIds?: number[] | undefined;
  propertiesFound: number;
  propertiesSynced: number;
  reportLogIds: string[];
  autoProcessed: boolean;
  stagedCount?: number;
  transformedCount?: number;
  projectedCount?: number;
};

export function resolveBudgetReportYears(input: {
  fiscalYear?: number;
  budgetType?: string;
  targetBudgetYear?: number;
}): { referenceFiscalYear: number; targetBudgetYear: number } {
  const currentCalYear = new Date().getUTCFullYear();

  let referenceFiscalYear: number;
  const normalizedBudgetType = input.budgetType?.trim().toLowerCase();

  if (normalizedBudgetType === "previousfy") {
    referenceFiscalYear = input.fiscalYear ?? (currentCalYear - 1);
  } else if (normalizedBudgetType === "currentfy") {
    referenceFiscalYear = input.fiscalYear ?? currentCalYear;
  } else {
    referenceFiscalYear = input.fiscalYear ?? currentCalYear;
  }

  const targetBudgetYear = input.targetBudgetYear ?? (referenceFiscalYear + 1);

  return { referenceFiscalYear, targetBudgetYear };
}

function toJsonObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, any>;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export async function updatePropertyFiscalConfigFromReportPayload(
  propertyId: string,
  responsePayload: any,
  explicitTargetBudgetYear?: number
): Promise<void> {
  try {
    const results = responsePayload?.response?.result;
    if (!Array.isArray(results) || results.length === 0) return;

    const budgetRows: any[] = [];
    for (const resItem of results) {
      const rawData = resItem?.reportData;
      if (Array.isArray(rawData)) {
        budgetRows.push(...rawData);
      } else if (rawData && typeof rawData === "object") {
        if (Array.isArray(rawData.budget)) {
          budgetRows.push(...rawData.budget);
        } else {
          budgetRows.push(...Object.values(rawData));
        }
      }
    }

    if (budgetRows.length === 0) return;

    const sampleRow = budgetRows.find((row) =>
      row && typeof row === "object" && Object.keys(row).some((key) => /^[a-z]{3}_\d{4}$/i.test(key))
    );
    if (!sampleRow) return;

    const monthKeys = Object.keys(sampleRow).filter((key) =>
      /^[a-z]{3}_\d{4}$/i.test(key)
    );
    if (monthKeys.length === 0) return;

    const parsedMonths = monthKeys
      .map((key) => {
        const parts = key.split("_");
        if (parts.length < 2) return null;
        const mStr = (parts[0] ?? "").toLowerCase();
        const yNum = parseInt(parts[1] ?? "", 10);
        const mNum = MONTH_NAME_MAP[mStr];
        if (!mNum || isNaN(yNum)) return null;
        return { key, year: yNum, month: mNum, absMonth: yNum * 12 + (mNum - 1) };
      })
      .filter((item): item is { key: string; year: number; month: number; absMonth: number } => Boolean(item))
      .sort((a, b) => a.absMonth - b.absMonth);

    if (parsedMonths.length === 0) return;

    const firstMonth = parsedMonths[0]!;
    const lastMonth = parsedMonths[parsedMonths.length - 1]!;

    const startMonth = firstMonth.month;
    const endMonth = lastMonth.month;

    const targetStartYear = explicitTargetBudgetYear ?? firstMonth.year;
    const targetEndYear = explicitTargetBudgetYear
      ? (endMonth < startMonth ? explicitTargetBudgetYear + 1 : explicitTargetBudgetYear)
      : lastMonth.year;

    const fiscalStartDate = new Date(Date.UTC(targetStartYear, startMonth - 1, 1));
    const fiscalEndDate = new Date(Date.UTC(targetEndYear, endMonth, 0));

    const budgetYearType = (startMonth === 1 ? "CALENDAR_YEAR" : "FISCAL_YEAR") as any;

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

    const isSame =
      currentProp?.budgetYear === targetStartYear &&
      currentProp?.budgetYearType === budgetYearType &&
      currentProp?.fiscalYearStartMonth === startMonth &&
      currentProp?.fiscalYearEndMonth === endMonth &&
      currentProp?.fiscalYearStartDate?.toISOString().slice(0, 10) === fiscalStartDate.toISOString().slice(0, 10) &&
      currentProp?.fiscalYearEndDate?.toISOString().slice(0, 10) === fiscalEndDate.toISOString().slice(0, 10);

    if (isSame) {
      console.log(
        `[SyncBudgetReportJob] Property ${propertyId} fiscal config is unchanged ` +
          `(${budgetYearType}, budgetYear=${targetStartYear}, start=${startMonth}, end=${endMonth}). Skipping update.`
      );
      return;
    }

    console.log(
      `[SyncBudgetReportJob] Updating Property ${propertyId} fiscal config: ` +
        `budgetYear=${targetStartYear}, type=${budgetYearType}, ` +
        `start=${startMonth}/${targetStartYear} (${fiscalStartDate.toISOString().split("T")[0]}), ` +
        `end=${endMonth}/${targetEndYear} (${fiscalEndDate.toISOString().split("T")[0]})`
    );

    const systemAdminUserId = await resolveSystemAdminUserId(prisma);

    await prisma.property.update({
      where: { id: propertyId },
      data: {
        budgetYear: targetStartYear,
        budgetYearType,
        fiscalYearStartMonth: startMonth,
        fiscalYearEndMonth: endMonth,
        fiscalYearStartDate: fiscalStartDate,
        fiscalYearEndDate: fiscalEndDate,
        updatedSource: "ENTRATA",
        ...(systemAdminUserId ? { updatedBy: systemAdminUserId } : {}),
      },
    });
  } catch (err: any) {
    console.error(`[WARN] Failed updating property fiscal config for ${propertyId}:`, err?.message ?? err);
  }
}

/**
 * Resolves GL Tree ID:
 * - Livano properties: "1913"
 * - Non-Livano properties: "1812"
 * - Explicit glTreeId override if supplied
 */
function resolveGlTreeIdForProperty(
  property: { ownerName?: string | null; name?: string | null },
  explicitGlTreeId?: string
): string {
  if (explicitGlTreeId?.trim()) {
    return explicitGlTreeId.trim();
  }

  const isLivano =
    (property.ownerName && property.ownerName.toLowerCase().includes("livano")) ||
    (property.name && property.name.toLowerCase().includes("livano"));

  return isLivano ? "1913" : "1812";
}

export async function syncEntrataBudgetReportJob(
  data: SyncBudgetReportJobData
): Promise<SyncBudgetReportJobResult> {
  const syncRunId = randomUUID();
  const ownerFilter = data.ownerFilter ?? "all";
  const { referenceFiscalYear, targetBudgetYear } = resolveBudgetReportYears(data);
  const targetCodes = data.propertyCodes ?? data.propertyIds;
  const balanceSheetAccountsStr = data.balanceSheetAccounts ? "1" : "0";

  console.log(`================================================================================`);
  console.log(`[SyncBudgetReportJob] Starting sync run ${syncRunId}`);
  console.log(`  Budget Type            : ${data.budgetType ?? "NONE"}`);
  console.log(`  Reference FY           : ${referenceFiscalYear}`);
  console.log(`  Target Budget Year     : ${targetBudgetYear}`);
  console.log(`  Owner Filter           : ${ownerFilter}`);
  console.log(`  Target Properties      : ${targetCodes?.length ? targetCodes.join(", ") : "ALL"}`);
  console.log(`  Balance Sheet Accounts : ${balanceSheetAccountsStr}`);
  console.log(`  GL Tree ID Override    : ${data.glTreeId ?? "NONE (Auto: 1913 for Livano, 1812 for Non-Livano)"}`);
  console.log(`  GL Book IDs            : ${data.glBookIds?.length ? JSON.stringify(data.glBookIds) : "DEFAULT"}`);
  console.log(`  Auto Process           : ${data.autoProcess ?? false}`);
  console.log(`================================================================================`);

  data.onProgress?.(
    `[INFO] Starting Entrata Budget Report sync (syncRunId: ${syncRunId}, FY: ${referenceFiscalYear}, targetBudgetYear: ${targetBudgetYear}, balanceSheetAccounts: ${balanceSheetAccountsStr})...`
  );

  // 1. Resolve properties based on owner filter
  const propWhere: any = {
    companyId: data.companyId,
    organisationId: data.organisationId,
  };

  if (ownerFilter === "livano") {
    propWhere.OR = [
      { ownerName: { contains: "Livano", mode: "insensitive" } },
      { name: { contains: "Livano", mode: "insensitive" } },
    ];
  } else if (ownerFilter === "non-livano") {
    propWhere.AND = [
      { OR: [{ ownerName: null }, { ownerName: { not: "Livano" } }] },
      { name: { not: { contains: "Livano", mode: "insensitive" } } },
    ];
  }

  if (targetCodes && targetCodes.length > 0) {
    const numericIds = targetCodes
      .map((id) => Number.parseInt(id, 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    const propertyFilterConditions: Prisma.PropertyWhereInput[] = [
      { code: { in: targetCodes } },
    ];
    if (numericIds.length > 0) {
      propertyFilterConditions.push({ externalId: { in: numericIds } });
    }

    if (propWhere.AND) {
      (propWhere.AND as Prisma.PropertyWhereInput[]).push({ OR: propertyFilterConditions });
    } else {
      propWhere.OR = propertyFilterConditions;
    }
  }

  const properties = await prisma.property.findMany({
    where: propWhere,
    select: { id: true, code: true, externalId: true, name: true, ownerName: true },
  });

  const propCountMsg = `[INFO] Resolved ${properties.length} target property candidate(s) for Budget Report sync.`;
  console.log(`[SyncBudgetReportJob] ${propCountMsg}`);
  data.onProgress?.(propCountMsg);

  const reportLogIds: string[] = [];

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

    let apiKey: string | undefined;
    const apiKeyRef = asString(credentialsJson.apiKeyRef);
    if (apiKeyRef?.startsWith("env://")) {
      apiKey = process.env[apiKeyRef.replace("env://", "")];
    }
    if (!apiKey) {
      apiKey = asString(credentialsJson.apiKey) ?? undefined;
    }

    if (orgSlug && apiKey) {
      const connector = new EntrataReportsConnector(
        { baseUrl, orgSlug, minDelayMs: 1200 },
        { apiKey }
      );

      for (let idx = 0; idx < properties.length; idx++) {
        const property = properties[idx];
        if (!property) continue;
        const reportLogId = randomUUID();
        const requestId = String(Date.now());
        const sourcePropertyId = property.externalId ? String(property.externalId) : (property.code ?? "");
        const glTreeId = resolveGlTreeIdForProperty(property, data.glTreeId);

        const callMsg = `[INFO] [${idx + 1}/${properties.length}] Calling Entrata getReportData - budget for ${property.name ?? "Unknown"} (code: ${sourcePropertyId}, glTreeId: ${glTreeId}, balanceSheetAccounts: ${balanceSheetAccountsStr})...`;
        console.log(`[SyncBudgetReportJob] ${callMsg}`);
        data.onProgress?.(callMsg);

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
            balance_sheet_accounts: balanceSheetAccountsStr,
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
          const responsePayload: any = await connector.fetchReportData(requestPayload);
          const responseCode = responsePayload?.response?.code ?? 200;
          const success = responseCode === 200;

          if (success) {
            const respMsg = `[INFO] [${idx + 1}/${properties.length}] ${property.name ?? property.code}: Entrata response received (HTTP status: ${responseCode}).`;
            console.log(`[SyncBudgetReportJob] ${respMsg}`);
            data.onProgress?.(respMsg);
          } else {
            const respMsg = `[WARN] [${idx + 1}/${properties.length}] ${property.name ?? property.code}: Entrata returned non-200 response (${responseCode}).`;
            console.warn(`[SyncBudgetReportJob] ${respMsg}`);
            data.onProgress?.(respMsg);
          }

          if (success && property.id && data.updateFiscalConfig) {
            await updatePropertyFiscalConfigFromReportPayload(
              property.id,
              responsePayload,
              targetBudgetYear
            );
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
              glBookIds: (data.glBookIds ?? []) as unknown as Prisma.InputJsonValue,
              accountingMethod: "Accrual",
              requestPayload: requestPayload as Prisma.InputJsonValue,
              responsePayload: responsePayload as Prisma.InputJsonValue,
              responseCode,
              status: success ? "SUCCESS" : "FAILED",
              errorMessage: success ? null : "Entrata budget report API returned non-200 response.",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });

          reportLogIds.push(reportLogId);
          console.log(`[SyncBudgetReportJob] Successfully saved report API log ${reportLogId} for property ${sourcePropertyId} (HTTP status: ${responseCode}).`);
        } catch (fetchErr: any) {
          const errMsg = `[ERROR] [${idx + 1}/${properties.length}] Failed fetching Entrata budget report for property ${sourcePropertyId}: ${fetchErr?.message ?? fetchErr}`;
          console.error(errMsg);
          data.onProgress?.(errMsg);
        }
      }
    } else {
      const warnMsg = `[WARN] Missing Entrata orgSlug or apiKey. Skipping live API fetch.`;
      console.warn(warnMsg);
      data.onProgress?.(warnMsg);
    }
  }

  let stagedCount = 0;
  let transformedCount = 0;
  let projectedCount = 0;

  // 3. Auto-process 3-Stage Pipeline if enabled
  if (data.autoProcess) {
    const stageMsg = `[INFO] Executing Stage 1 (Staging: fn_stage_budget_report_from_logs)...`;
    console.log(`[SyncBudgetReportJob] ${stageMsg}`);
    data.onProgress?.(stageMsg);

    const stageRes = await prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM public.fn_stage_budget_report_from_logs(
        '${data.companyId}'::uuid,
        '${data.organisationId}'::uuid,
        '${data.integrationSourceId}'::uuid,
        '${syncRunId}'::uuid
      );
    `);
    stagedCount = Number(stageRes?.[0]?.staged_count ?? 0);
    const stageDoneMsg = `[INFO] Stage 1 Completed. Staged records: ${stagedCount}`;
    console.log(`[SyncBudgetReportJob] ${stageDoneMsg}`);
    data.onProgress?.(stageDoneMsg);

    const transformMsg = `[INFO] Executing Stage 2 (Transformation: fn_transform_budget_report)...`;
    console.log(`[SyncBudgetReportJob] ${transformMsg}`);
    data.onProgress?.(transformMsg);

    const transformRes = await prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM public.fn_transform_budget_report(
        '${data.companyId}'::uuid,
        '${data.organisationId}'::uuid,
        '${data.integrationSourceId}'::uuid,
        '${syncRunId}'::uuid
      );
    `);
    transformedCount = Number(transformRes?.[0]?.transformed_count ?? 0);
    const transformDoneMsg = `[INFO] Stage 2 Completed. Transformed records: ${transformedCount}`;
    console.log(`[SyncBudgetReportJob] ${transformDoneMsg}`);
    data.onProgress?.(transformDoneMsg);

    const projectMsg = `[INFO] Executing Stage 3 (Projection: fn_project_budgets_from_master_report)...`;
    console.log(`[SyncBudgetReportJob] ${projectMsg}`);
    data.onProgress?.(projectMsg);

    const projectRes = await prisma.$queryRawUnsafe<any[]>(`
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
    const projectDoneMsg = `[INFO] Stage 3 Completed. Upserted calc lines: ${projectedCount}`;
    console.log(`[SyncBudgetReportJob] ${projectDoneMsg}`);
    data.onProgress?.(projectDoneMsg);

    // 4. Staging Cleanup for target property(ies) / syncRunId
    const cleanupMsg = `[INFO] Cleaning up staging data from staging_budget_reports for target property/syncRun...`;
    console.log(`[SyncBudgetReportJob] ${cleanupMsg}`);
    data.onProgress?.(cleanupMsg);

    const propIdList = properties.map((p) => `'${p.id}'::uuid`).join(",");
    const sourceIdList = properties.map((p) => `'${p.externalId ? String(p.externalId) : (p.code ?? "")}'`).join(",");
    const cleanupClause = propIdList.length > 0
      ? `(sync_run_id = '${syncRunId}'::uuid OR property_id IN (${propIdList}) OR source_property_id IN (${sourceIdList})) AND (transform_status = 'TRANSFORMED' OR sync_run_id = '${syncRunId}'::uuid)`
      : `sync_run_id = '${syncRunId}'::uuid`;

    const cleanedRows = await prisma.$executeRawUnsafe(`
      DELETE FROM public.staging_budget_reports
      WHERE ${cleanupClause};
    `);
    const cleanupDoneMsg = `[INFO] Staging cleanup completed: removed ${cleanedRows} staged record(s).`;
    console.log(`[SyncBudgetReportJob] ${cleanupDoneMsg}`);
    data.onProgress?.(cleanupDoneMsg);
  }

  console.log(`================================================================================`);
  console.log(`[SyncBudgetReportJob] Sync run ${syncRunId} completed.`);
  console.log(`  Properties Synced : ${reportLogIds.length}`);
  console.log(`  Staged Count      : ${stagedCount}`);
  console.log(`  Transformed Count : ${transformedCount}`);
  console.log(`  Projected Lines   : ${projectedCount}`);
  console.log(`================================================================================`);

  data.onProgress?.(
    `[SUCCESS] Budget Report sync run ${syncRunId} completed successfully (Synced: ${reportLogIds.length}, Transformed: ${transformedCount}, Projected lines: ${projectedCount}).`
  );

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
