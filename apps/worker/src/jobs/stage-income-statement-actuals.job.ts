import { Prisma } from "@prisma/client";

import { prisma } from "@budget-integration/database";
import {
  transformIncomeStatementActualsQueue,
  type StageIncomeStatementActualsJobData,
} from "@budget-integration/integration-core";

type EntrataIncomeStatementRow = {
  account_number?: string | number | null;
  account_name?: string | null;
  gl_account_type_id?: number | null;
  path?: string | null;
  total?: number | string | null;

  property_name?: string | null;
  lookup_code?: string | null;
  unit_count?: number | string | null;

  [key: string]: unknown;
};

type EntrataReportResponsePayload = {
  response?: {
    result?: Array<{
      reportData?: EntrataIncomeStatementRow[];
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type StageIncomeStatementActualsResult = {
  syncRunId: string;
  reportLogsProcessed: number;
  rowsInsertedOrUpdated: number;
  rowsSkipped: number;
  transformQueued: boolean;
};

type ReportLogForStaging = {
  id: string;
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId: string;

  reportCode: string;
  reportName: string;
  reportVersion: string | null;
  methodVersion: string | null;

  sourcePropertyId: string | null;
  propertyId: string | null;
  propertyCode: string | null;

  glTreeId: string | null;
  glBookIds: Prisma.JsonValue | null;
  accountingMethod: string | null;

  latestPostMonth: Date | null;
  trailingPeriods: number | null;
  createdAt: Date;

  responsePayload: Prisma.JsonValue | null;
  requestPayload: Prisma.JsonValue | null;
};

function buildJobId(...parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
    .map((part) =>
      String(part)
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "_")
    )
    .join("_");
}

function toJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, any>;
}

function parseGlBookIds(value: Prisma.JsonValue | null | undefined): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "number" || typeof value === "string") {
    return [String(value)];
  }

  return [];
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

function getMonthEnd(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function subtractMonthsKeepingMonthEnd(baseMonthEnd: Date, monthsToSubtract: number): Date {
  /*
    If baseMonthEnd = 2026-06-30:
      subtract 0 => 2026-06-30
      subtract 1 => 2026-05-31
      subtract 2 => 2026-04-30

    This is required because:
      month_1 = latest closed month
      month_2 = prior month
      month_3 = two months before
  */
  const utcYear = baseMonthEnd.getUTCFullYear();
  const utcMonth = baseMonthEnd.getUTCMonth();

  const targetMonth = new Date(Date.UTC(utcYear, utcMonth - monthsToSubtract, 1));
  return getMonthEnd(targetMonth);
}

function getFiscalYearFromPostMonth(postMonth: Date): number {
  return postMonth.getUTCFullYear();
}

function extractReportDataRows(
  responsePayload: Prisma.JsonValue | null
): EntrataIncomeStatementRow[] {
  const payload = toJsonObject(responsePayload) as EntrataReportResponsePayload;

  const result = payload.response?.result;

  if (!Array.isArray(result)) {
    return [];
  }

  const rows: EntrataIncomeStatementRow[] = [];

  for (const resultItem of result) {
    if (Array.isArray(resultItem.reportData)) {
      rows.push(...resultItem.reportData);
    }
  }

  return rows;
}

function getPropertyActiveMonth(glPostMonth: string | null | undefined): Date | null {
  if (!glPostMonth) return null;
  const parts = glPostMonth.split("/");
  if (parts.length !== 2) return null;
  const monthNo = Number.parseInt(parts[0] ?? "", 10);
  const year = Number.parseInt(parts[1] ?? "", 10);
  if (Number.isNaN(monthNo) || Number.isNaN(year)) return null;

  // glPostMonth = 07/2026. Active month in Entrata is August 2026.
  // UTC(year, monthNo) sets it to month index 'monthNo' (which is the next month, i.e. August, since JS months are 0-based).
  const firstOfActiveMonth = new Date(Date.UTC(year, monthNo, 1));
  // Get last day of active month
  return new Date(Date.UTC(firstOfActiveMonth.getUTCFullYear(), firstOfActiveMonth.getUTCMonth() + 1, 0));
}

function getMonthIndexesToRead(trailingPeriods: number | null): number[] {
  /*
    Entrata can return month_1 ... month_15 in the payload.
    For actual sync, read the full series from month_1 up to trailingPeriods + 1.
    Future months will be dynamically filtered based on each property's active month.
  */
  const count = trailingPeriods && trailingPeriods > 0 ? trailingPeriods + 1 : 13;

  return Array.from({ length: count }, (_, index) => index + 1);
}

function getTransformStatusForLogRows(rowCount: number): string {
  return rowCount > 0 ? "STAGED" : "NO_ROWS";
}

async function getReportLogs(data: StageIncomeStatementActualsJobData): Promise<ReportLogForStaging[]> {
  return prisma.integrationReportApiLog.findMany({
    where: {
      companyId: data.companyId,
      organisationId: data.organisationId,
      integrationSourceId: data.integrationSourceId,
      syncRunId: data.syncRunId,
      reportCode: "income_statement_actuals",
      status: "SUCCESS",
      ...(data.reportLogId ? { id: data.reportLogId } : {}),
    },
    select: {
      id: true,
      companyId: true,
      organisationId: true,
      integrationSourceId: true,
      syncRunId: true,

      reportCode: true,
      reportName: true,
      reportVersion: true,
      methodVersion: true,

      sourcePropertyId: true,
      propertyId: true,
      propertyCode: true,

      glTreeId: true,
      glBookIds: true,
      accountingMethod: true,

      latestPostMonth: true,
      trailingPeriods: true,
      createdAt: true,

      responsePayload: true,
      requestPayload: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function stageIncomeStatementActualsJob(
  data: StageIncomeStatementActualsJobData
): Promise<StageIncomeStatementActualsResult> {
  const reportLogs = await getReportLogs(data);

  let rowsInsertedOrUpdated = 0;
  let rowsSkipped = 0;

  if (reportLogs.length === 0) {
    return {
      syncRunId: data.syncRunId,
      reportLogsProcessed: 0,
      rowsInsertedOrUpdated: 0,
      rowsSkipped: 0,
      transformQueued: false,
    };
  }

  for (const log of reportLogs) {
    if (!log.sourcePropertyId) {
      rowsSkipped += 1;

      await prisma.integrationReportApiLog.update({
        where: {
          id: log.id,
        },
        data: {
          status: "FAILED",
          errorMessage: "source_property_id is missing in report log.",
          updatedAt: new Date(),
        },
      });

      continue;
    }

    if (!log.latestPostMonth) {
      rowsSkipped += 1;

      await prisma.integrationReportApiLog.update({
        where: {
          id: log.id,
        },
        data: {
          status: "FAILED",
          errorMessage: "latest_post_month is missing in report log.",
          updatedAt: new Date(),
        },
      });

      continue;
    }

    if (!log.glTreeId) {
      rowsSkipped += 1;

      await prisma.integrationReportApiLog.update({
        where: {
          id: log.id,
        },
        data: {
          status: "FAILED",
          errorMessage: "gl_tree_id is missing in report log.",
          updatedAt: new Date(),
        },
      });

      continue;
    }

    const glBookIds = parseGlBookIds(log.glBookIds);

    if (glBookIds.length === 0) {
      rowsSkipped += 1;

      await prisma.integrationReportApiLog.update({
        where: {
          id: log.id,
        },
        data: {
          status: "FAILED",
          errorMessage: "gl_book_ids is missing in report log.",
          updatedAt: new Date(),
        },
      });

      continue;
    }

    const responseRows = extractReportDataRows(log.responsePayload);
    const requestPayload = toJsonObject(log.requestPayload);
    const filters = toJsonObject(requestPayload.filters);
    const periodObj = toJsonObject(filters.period);
    const showPeriodsFrom = String(filters.show_periods_from ?? "0");
    const isOldestToNewest = showPeriodsFrom === "0" || showPeriodsFrom === "2" || periodObj.period_type === "currentfyr";

    const propertyInfo = log.propertyId
      ? await prisma.property.findUnique({
          where: { id: log.propertyId },
          select: { fiscalYearStartMonth: true, budgetYear: true }
        })
      : null;

    const startMonth = propertyInfo?.fiscalYearStartMonth || 1;
    const fyYear = Number(
      requestPayload.fiscalYear ??
      propertyInfo?.budgetYear ??
      (log.latestPostMonth ? log.latestPostMonth.getUTCFullYear() : new Date().getUTCFullYear())
    );

    const monthIndexes = isOldestToNewest
      ? Array.from({ length: 12 }, (_, index) => index + 1)
      : getMonthIndexesToRead(log.trailingPeriods);

    const propertyPostMonth = await prisma.propertyPostMonth.findUnique({
      where: { propertyId: log.propertyId || "" }
    });
    const propertyActiveMonth = getPropertyActiveMonth(propertyPostMonth?.glPostMonth);

    const pmParam = periodObj.pm;
    let pmAnchorMonth: Date | null = null;
    if (pmParam && periodObj.period_type === "pm") {
      const parts = String(pmParam).split("/");
      if (parts.length === 2) {
        const monthVal = Number.parseInt(parts[0] ?? "", 10);
        const yearVal = Number.parseInt(parts[1] ?? "", 10);
        if (!Number.isNaN(monthVal) && !Number.isNaN(yearVal)) {
          pmAnchorMonth = new Date(Date.UTC(yearVal, monthVal, 0));
        }
      }
    }

    const anchorMonth = pmAnchorMonth ?? propertyActiveMonth ?? log.latestPostMonth ?? log.createdAt;

    let stagedRowsForLog = 0;
    const rowsToCreate: any[] = [];

    for (const sourceRow of responseRows) {
      const accountNumber = asString(sourceRow.account_number);

      if (!accountNumber) {
        rowsSkipped += 1;
        continue;
      }

      const accountName = asString(sourceRow.account_name);
      const glAccountTypeId = asNumber(sourceRow.gl_account_type_id);
      const accountPath = asString(sourceRow.path);
      const totalAmount = asNumber(sourceRow.total);

      const propertyName = asString(sourceRow.property_name);
      const lookupCode = asString(sourceRow.lookup_code);
      const unitCount = asNumber(sourceRow.unit_count);

      for (const monthIndex of monthIndexes) {
        const monthFieldName = `month_${monthIndex}`;
        const actualAmount = asNumber(sourceRow[monthFieldName]);

        /*
          If Entrata returns null for the month, do not stage it.
          If Entrata returns 0, stage it because 0 is a valid actual.
        */
        if (actualAmount === null) {
          rowsSkipped += 1;
          continue;
        }

        let postMonth: Date;
        let fiscalYear: number;

        if (isOldestToNewest) {
          // Oldest to newest: month_1 is the 1st month of the fiscal year
          postMonth = new Date(Date.UTC(fyYear, (startMonth - 1) + monthIndex, 0));
          fiscalYear = fyYear;
        } else {
          const monthsToSubtract = monthIndex - 1;
          postMonth = subtractMonthsKeepingMonthEnd(
            anchorMonth,
            monthsToSubtract
          );

          if (log.latestPostMonth && postMonth.getUTCFullYear() < log.latestPostMonth.getUTCFullYear() - 1) {
            // Skip months older than the previous calendar year (e.g. 2025 when 2027 is requested)
            rowsSkipped += 1;
            continue;
          }

          fiscalYear = getFiscalYearFromPostMonth(postMonth);
        }

        /*
          One row per gl_book_id. Currently your request passes [1909],
          but this design supports multiple gl books if Entrata requires later.
        */
        for (const glBookId of glBookIds) {
          rowsToCreate.push({
            companyId: log.companyId,
            organisationId: log.organisationId,
            integrationSourceId: log.integrationSourceId,

            syncRunId: log.syncRunId,
            reportLogId: log.id,

            sourcePropertyId: log.sourcePropertyId,
            propertyId: log.propertyId,
            propertyCode: log.propertyCode,

            propertyName,
            lookupCode,
            unitCount: unitCount === null ? null : Math.trunc(unitCount),

            reportCode: log.reportCode,
            reportName: log.reportName,
            reportVersion: log.reportVersion,
            methodVersion: log.methodVersion,

            glTreeId: log.glTreeId,
            glBookId,
            accountingMethod: log.accountingMethod,

            accountNumber,
            accountName,
            glAccountTypeId: glAccountTypeId === null ? null : Math.trunc(glAccountTypeId),
            accountPath,

            monthIndex,
            postMonth,
            fiscalYear,

            actualAmount: new Prisma.Decimal(actualAmount),
            totalAmount: totalAmount === null ? null : new Prisma.Decimal(totalAmount),

            rawRecordPayload: {} as Prisma.InputJsonValue,

            transformStatus: "PENDING",
            transformErrors: Prisma.JsonNull,
            transformedAt: null,

            createdAt: new Date(),
            updatedAt: new Date()
          });

          stagedRowsForLog += 1;
          rowsInsertedOrUpdated += 1;
        }
      }
    }

    if (rowsToCreate.length > 0) {
      await prisma.stagingIncomeStatementActual.createMany({
        data: rowsToCreate,
        skipDuplicates: true
      });
    }

    await prisma.integrationReportApiLog.update({
      where: {
        id: log.id,
      },
      data: {
        status: getTransformStatusForLogRows(stagedRowsForLog),
        stagedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  let transformQueued = false;

  if (data.autoTransform && rowsInsertedOrUpdated > 0) {
    const transformJob = await transformIncomeStatementActualsQueue.add(
      "transform-income-statement-actuals",
      {
        companyId: data.companyId,
        organisationId: data.organisationId,
        integrationSourceId: data.integrationSourceId,
        entityName: "IncomeStatementActuals",
        syncRunId: data.syncRunId,
        autoProject: data.autoProject ?? false,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 1000,
        jobId: buildJobId(
          "transform-income-statement-actuals",
          data.integrationSourceId,
          data.syncRunId,
          Date.now()
        ),
      }
    );

    transformQueued = !!transformJob.id;
  }

  return {
    syncRunId: data.syncRunId,
    reportLogsProcessed: reportLogs.length,
    rowsInsertedOrUpdated,
    rowsSkipped,
    transformQueued,
  };
}