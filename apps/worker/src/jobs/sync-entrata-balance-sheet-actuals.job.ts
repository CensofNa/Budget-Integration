import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import {
  stageBalanceSheetActualsQueue,
  type SyncBalanceSheetActualsJobData,
} from "@budget-integration/integration-core";
import { EntrataReportsConnector } from "@budget-integration/connector-entrata";
import { stageBalanceSheetActualsJob } from "./stage-balance-sheet-actuals.job.js";
import { transformBalanceSheetActualsJob } from "./transform-balance-sheet-actuals.job.js";
import { projectBalanceSheetActualsJob } from "./project-balance-sheet-actuals.job.js";

type EntrataReportResponse = {
  response?: {
    requestId?: string | number;
    code?: number;
    result?: Array<{
      reportData?: unknown[];
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type SyncableProperty = {
  propertyId: string;
  propertyCode: string;
  propertyName: string | null;
  fiscalYearStartMonth: number;
};

export type SyncBalanceSheetActualsResult = {
  syncRunId: string;
  reportCode: string;
  reportName: string;
  propertyCount: number;
  successfulCount: number;
  failedCount: number;
  reportLogIds: string[];
  stageResult?: any;
  transformResult?: any;
  projectResult?: any;
};

function toJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, any>;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function isSuccessfulEntrataResponse(payload: EntrataReportResponse | null | undefined): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const code = payload?.response?.code;
  return code === 200;
}

function getEntrataResponseCode(payload: EntrataReportResponse | null | undefined): number | null {
  const code = payload?.response?.code;
  return typeof code === "number" && Number.isFinite(code) ? code : null;
}

/**
 * Resolves Entrata GL Tree ID based on property metadata:
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

function computeTrailingPeriods(fiscalYearStartMonth: number): number {
  const now = new Date();
  const currentMonth = now.getUTCMonth() + 1; // 1..12
  const startMonth = fiscalYearStartMonth >= 1 && fiscalYearStartMonth <= 12 ? fiscalYearStartMonth : 1;

  // In Entrata getReportData, period_type 'currentpm' returns the current post month PLUS 'trailing_periods' prior months.
  // To have the oldest returned month match the start of the fiscal year (startMonth):
  // trailing_periods = (currentMonth - startMonth + 12) % 12
  // E.g.: currentMonth = 10 (Oct), startMonth = 4 (Apr) => (10 - 4 + 12) % 12 = 6 trailing periods
  // (Entrata returns Oct + 6 prior months: Sep, Aug, Jul, Jun, May, Apr = exactly 7 fiscal months).
  // Include current month and all prior months back to fiscal start month (e.g. Jan to Oct = 10 periods)
  return ((currentMonth - startMonth + 12) % 12) + 1;
}

export async function syncEntrataBalanceSheetActualsJob(
  data: SyncBalanceSheetActualsJobData & { runSynchronously?: boolean }
): Promise<SyncBalanceSheetActualsResult> {
  const syncRunId = data.syncRunId || randomUUID();

  console.log("[INFO] Balance Sheet Actuals sync job started.", {
    syncRunId,
    companyId: data.companyId,
    organisationId: data.organisationId,
    integrationSourceId: data.integrationSourceId,
    fiscalYear: data.fiscalYear,
    propertyIds: data.propertyIds,
    propertyCodes: data.propertyCodes,
  });
  data.onProgress?.(`[INFO] Balance Sheet Actuals sync started (syncRunId: ${syncRunId})...`);

  const source = await prisma.integrationSource.findFirst({
    where: {
      id: data.integrationSourceId,
      companyId: data.companyId,
      organisationId: data.organisationId,
      sourceType: "entrata",
      isActive: true,
    },
    include: {
      config: true,
    },
  });

  if (!source?.config) {
    throw new Error("No active Entrata source config found for Balance Sheet sync.");
  }

  const connectionJson = toJsonObject(source.config.connectionJson);
  const credentialsJson = toJsonObject(source.config.credentialsJson);

  const baseUrl = asString(connectionJson.baseUrl) ?? "https://apis.entrata.com";
  const orgSlug = asString(connectionJson.orgSlug);

  if (!orgSlug) {
    throw new Error("Entrata orgSlug is missing in IntegrationSourceConfig.connectionJson.");
  }

  const apiKeyRef = asString(credentialsJson.apiKeyRef);
  let apiKey: string | undefined;

  if (apiKeyRef?.startsWith("env://")) {
    const envKey = apiKeyRef.replace("env://", "");
    apiKey = process.env[envKey];
  }

  if (!apiKey) {
    apiKey = asString(credentialsJson.apiKey) ?? undefined;
  }

  if (!apiKey) {
    throw new Error("Entrata API key not configured.");
  }

  const rawGlBook = data.glBookId ?? 1909;
  const glBookIds: number[] = Array.isArray(rawGlBook)
    ? rawGlBook.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : [Number(rawGlBook)];

  const accountingMethod = data.accountingMethod ?? "accrual";

  let requestedCodes: string[] = [];
  const rawCodes = data.propertyCodes ?? data.propertyIds;
  if (rawCodes) {
    requestedCodes = Array.isArray(rawCodes)
      ? rawCodes.map((p) => String(p).trim()).filter((p) => p.length > 0)
      : [String(rawCodes).trim()];
  }

  // Resolve target properties
  const ownerFilter = data.ownerFilter ?? "all";
  const propWhere: Prisma.PropertyWhereInput = {
    companyId: data.companyId,
    organisationId: data.organisationId,
    isDisabled: false,
    ...(requestedCodes.length === 0 ? { status: "ACTIVE" } : {}),
  };

  if (ownerFilter === "livano") {
    propWhere.OR = [
      { ownerName: { contains: "Livano", mode: "insensitive" } },
      { name: { contains: "Livano", mode: "insensitive" } },
    ];
  } else if (ownerFilter === "non-livano") {
    propWhere.AND = [
      { OR: [{ ownerName: null }, { ownerName: { not: { contains: "Livano" } } }] },
      { name: { not: { contains: "Livano" } } },
    ];
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const uuidCodes = requestedCodes.filter((c) => uuidRegex.test(c));
  const numericCodes = requestedCodes
    .map((c) => Number(c))
    .filter((n) => Number.isFinite(n) && Number.isInteger(n));

  const orConditions: Prisma.PropertyWhereInput[] = [
    { code: { in: requestedCodes } },
  ];
  if (uuidCodes.length > 0) {
    orConditions.push({ id: { in: uuidCodes } });
  }
  if (numericCodes.length > 0) {
    orConditions.push({ externalId: { in: numericCodes } });
  }

  if (requestedCodes.length > 0) {
    const codeCondition = { OR: orConditions };
    if (propWhere.AND) {
      propWhere.AND = Array.isArray(propWhere.AND)
        ? [...propWhere.AND, codeCondition]
        : [propWhere.AND, codeCondition];
    } else {
      propWhere.AND = [codeCondition];
    }
  }

  const propertyRows = await prisma.property.findMany({
    where: propWhere,
    select: {
      id: true,
      code: true,
      name: true,
      ownerName: true,
      fiscalYearStartMonth: true,
      externalId: true,
    },
  });

  if (propertyRows.length === 0) {
    const warnMsg = "[WARN] No matching active properties found for Balance Sheet sync.";
    console.warn(warnMsg);
    data.onProgress?.(warnMsg);
    return {
      syncRunId,
      reportCode: "balance_sheet",
      reportName: "balance_sheet",
      propertyCount: 0,
      successfulCount: 0,
      failedCount: 0,
      reportLogIds: [],
    };
  }

  const foundMsg = `[INFO] Found ${propertyRows.length} active property candidate(s) for Balance Sheet sync.`;
  console.log(foundMsg);
  data.onProgress?.(foundMsg);

  const connector = new EntrataReportsConnector(
    {
      baseUrl,
      orgSlug,
      minDelayMs: 1200,
    },
    {
      apiKey,
    }
  );

  let successfulCount = 0;
  let failedCount = 0;
  const reportLogIds: string[] = [];

  let idx = 0;
  for (const prop of propertyRows) {
    idx += 1;
    const currentIdx = idx;
    const totalProperties = propertyRows.length;
    const sourcePropertyId = prop.code || String(prop.externalId || prop.id);
    const reportLogId = randomUUID();
    const requestId = String(Date.now());
    const trailingPeriods = data.trailingPeriods ?? computeTrailingPeriods(prop.fiscalYearStartMonth ?? 1);
    const glTreeId = resolveGlTreeIdForProperty(prop, data.glTreeId);

    const isLivano =
      (prop.ownerName && prop.ownerName.toLowerCase().includes("livano")) ||
      (prop.name && prop.name.toLowerCase().includes("livano"));

    const callingMsg = `[INFO] [${currentIdx}/${totalProperties}] Calling Entrata for ${prop.name ?? "Unknown"} (code: ${sourcePropertyId}) [gl_tree_ids: ${glTreeId} (${isLivano ? "Livano" : "Non-Livano"})]...`;
    console.log(callingMsg);
    data.onProgress?.(callingMsg);

    const numericPropertyGroupId = prop.externalId ?? (Number.isFinite(Number(sourcePropertyId)) ? Number(sourcePropertyId) : null);

    const requestPayload = {
      requestId,
      reportName: "balance_sheet",
      reportVersion: "3.2",
      methodVersion: "r2",
      timeoutMs: 120000,
      filters: {
        property_group_ids: numericPropertyGroupId ? [numericPropertyGroupId] : [Number(sourcePropertyId)],
        gl_tree_ids: glTreeId,
        gl_book_ids: glBookIds,
        accounting_method: accountingMethod,
        location_type: "property",
        location_type_options: [],
        period: {
          period_type: "currentpm",
          allow_future_periods: false,
          trailing_periods: trailingPeriods,
          future_periods: 0,
        },
        compare_post_month: "0",
        compare_prior_year: "0",
        gl_account_numbers: "1",
        consolidate_by: "no_consolidation",
        summarize_accounts: [],
        calculate_net_change: "0",
        zero_balances: "1",
        balance_per_unit: "hide",
        include_paused_journal_entries: "0",
        departments: [],
        custom_tags: [],
        show_drill_ins: "1",
      },
    };

    try {
      const responsePayload = (await connector.fetchReportData(requestPayload)) as EntrataReportResponse;
      const responseCode = getEntrataResponseCode(responsePayload);
      const success = isSuccessfulEntrataResponse(responsePayload);

      await prisma.integrationReportApiLog.create({
        data: {
          id: reportLogId,
          companyId: data.companyId,
          organisationId: data.organisationId,
          integrationSourceId: data.integrationSourceId,
          syncRunId,
          sourcePropertyId,
          propertyId: prop.id,
          propertyCode: prop.code,
          reportCode: "balance_sheet",
          reportName: "balance_sheet",
          reportVersion: "3.2",
          methodVersion: "r2",
          glTreeId,
          glBookIds: glBookIds,
          accountingMethod,
          trailingPeriods,
          requestPayload: requestPayload as unknown as Prisma.InputJsonValue,
          responsePayload: responsePayload as unknown as Prisma.InputJsonValue,
          responseCode: responseCode ?? (success ? 200 : 500),
          status: success ? "SUCCESS" : "FAILED",
          errorMessage: success ? null : "Entrata returned error response for balance_sheet",
        },
      });

      if (success) {
        successfulCount += 1;
        reportLogIds.push(reportLogId);
        const successMsg = `[INFO] [${currentIdx}/${totalProperties}] ${prop.name ?? prop.code}: Entrata response received (200 OK).`;
        console.log(successMsg);
        data.onProgress?.(successMsg);
      } else {
        failedCount += 1;
        const failMsg = `[WARN] [${currentIdx}/${totalProperties}] ${prop.name ?? prop.code}: Entrata returned error response (${responseCode ?? 500}).`;
        console.warn(failMsg);
        data.onProgress?.(failMsg);
      }
    } catch (err: any) {
      failedCount += 1;
      const errMsg = `[ERROR] [${currentIdx}/${totalProperties}] Failed fetching balance_sheet for property ${sourcePropertyId}: ${err?.message || String(err)}`;
      console.error(errMsg);
      data.onProgress?.(errMsg);

      await prisma.integrationReportApiLog.create({
        data: {
          id: reportLogId,
          companyId: data.companyId,
          organisationId: data.organisationId,
          integrationSourceId: data.integrationSourceId,
          syncRunId,
          sourcePropertyId,
          propertyId: prop.id,
          propertyCode: prop.code,
          reportCode: "balance_sheet",
          reportName: "balance_sheet",
          reportVersion: "3.2",
          methodVersion: "r2",
          glTreeId,
          glBookIds: glBookIds,
          accountingMethod,
          trailingPeriods,
          requestPayload: requestPayload as unknown as Prisma.InputJsonValue,
          responseCode: 500,
          status: "FAILED",
          errorMessage: err?.message || String(err),
        },
      });
    }
  }

  const fetchSummaryMsg = `[INFO] Balance Sheet fetch completed: ${successfulCount} successful, ${failedCount} failed out of ${propertyRows.length} properties.`;
  console.log(fetchSummaryMsg);
  data.onProgress?.(fetchSummaryMsg);

  const shouldAutoStage = data.autoStage ?? true;
  let stageResult: any = undefined;
  let transformResult: any = undefined;
  let projectResult: any = undefined;

  if (successfulCount > 0 && shouldAutoStage) {
    if (data.runSynchronously) {
      // Execute the entire pipeline end-to-end synchronously
      data.onProgress?.(`[INFO] Staging Balance Sheet actuals for ${successfulCount} report log(s)...`);
      stageResult = await stageBalanceSheetActualsJob({
        companyId: data.companyId,
        organisationId: data.organisationId,
        integrationSourceId: data.integrationSourceId,
        entityName: "BalanceSheetActuals",
        syncRunId,
        autoTransform: false,
      });
      data.onProgress?.(`[INFO] Staging completed. Rows inserted/updated: ${stageResult?.rowsInsertedOrUpdated ?? 0}, skipped: ${stageResult?.rowsSkipped ?? 0}.`);

      data.onProgress?.(`[INFO] Transforming Balance Sheet actuals...`);
      transformResult = await transformBalanceSheetActualsJob({
        companyId: data.companyId,
        organisationId: data.organisationId,
        integrationSourceId: data.integrationSourceId,
        entityName: "BalanceSheetActuals",
        syncRunId,
        autoProject: false,
      });
      data.onProgress?.(`[INFO] Transform completed: ${transformResult?.insertedCount ?? 0} inserted, ${transformResult?.updatedCount ?? 0} updated, ${transformResult?.failedCount ?? 0} failed.`);

      if (data.autoProject !== false) {
        data.onProgress?.(`[INFO] Projecting Balance Sheet actuals to budget_calc_lines...`);
        projectResult = await projectBalanceSheetActualsJob({
          companyId: data.companyId,
          organisationId: data.organisationId,
          integrationSourceId: data.integrationSourceId,
          entityName: "BalanceSheetActuals",
          syncRunId,
          ...(data.fiscalYear !== undefined ? { fiscalYear: data.fiscalYear } : {}),
        });
        data.onProgress?.(`[INFO] Projection completed: ${projectResult?.totalCalcLinesUpserted ?? 0} calc lines upserted across ${projectResult?.propertyYearCount ?? 0} property-year(s).`);
      }
    } else {
      // Dispatch background queue
      data.onProgress?.(`[INFO] Enqueued background staging job for ${successfulCount} report logs.`);
      await stageBalanceSheetActualsQueue.add(
        "stage-balance-sheet-actuals",
        {
          companyId: data.companyId,
          organisationId: data.organisationId,
          integrationSourceId: data.integrationSourceId,
          entityName: "BalanceSheetActuals",
          syncRunId,
          autoTransform: data.autoTransform ?? true,
          autoProject: data.autoProject ?? true,
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
          removeOnComplete: 100,
          removeOnFail: 200,
        }
      );
    }
  }

  return {
    syncRunId,
    reportCode: "balance_sheet",
    reportName: "balance_sheet",
    propertyCount: propertyRows.length,
    successfulCount,
    failedCount,
    reportLogIds,
    stageResult,
    transformResult,
    projectResult,
  };
}
