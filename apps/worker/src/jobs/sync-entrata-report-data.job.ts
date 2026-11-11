import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";

import {
  IntegrationError,
  createSourceHash,
  asObject,
  asArray,
  getString,
  getNumberFromJson,
  getStringArray,
  chunkArray,
  resolveSystemAdminUserId,
} from "@budget-integration/integration-core";

import { EntrataReportsConnector } from "@budget-integration/connector-entrata";

type JsonObject = Record<string, unknown>;

export interface SyncEntrataReportDataJobInput {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  reportCode: string;
  filters?: Record<string, unknown> | undefined;

  /**
   * Existing name retained for compatibility.
   * These are Entrata property codes, for example ["100013236"], not internal UUID property IDs.
   * If omitted, property codes are fetched from the Property table.
   */
  propertyIds?: string[] | undefined;

  /**
   * Required for month-by-month occupancy report sync unless periodStart/periodEnd are passed.
   */
  fiscalYear?: number | undefined;

  /**
   * When true, sync fiscalYear - 1 also.
   * Useful for Beginning Occupancy Jan and LY comparison rows.
   */
  includePriorYear?: boolean | undefined;

  /**
   * Optional explicit daterange override.
   * Example: periodStart = "2026-02-23", periodEnd = "2026-03-01".
   */
  periodStart?: string | undefined;
  periodEnd?: string | undefined;
  updateFiscalConfig?: boolean | undefined;
}

export interface SyncEntrataReportDataJobResult {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId: string;
  reportRunId: string;
  reportCode: string;
  recordsReceived: number;
  recordsStaged: number;
  recordsPendingTransform: number;
  transformBatchSize: number;
  propertyCodes?: string[] | undefined;
  fiscalYear?: number | undefined;
}

function normalizeReportCode(reportCode: string): string {
  return reportCode.trim().toLowerCase();
}

function isOccupancyReport(reportCode: string): boolean {
  const normalizedReportCode = normalizeReportCode(reportCode);

  return (
    normalizedReportCode === "box_score" ||
    normalizedReportCode === "resident_retention"
  );
}

function isBoxReport(reportCode: string): boolean {
  const normalizedReportCode = normalizeReportCode(reportCode);

  return (
    normalizedReportCode === "box_score" ||
    normalizedReportCode.startsWith("box_")
  );
}

function removeFuturePeriodFields(
  period: Record<string, unknown>,
): Record<string, unknown> {
  const cleaned = { ...period };

  delete cleaned.allow_future_periods;
  delete cleaned.future_periods;
  delete cleaned.trailing_periods;

  return cleaned;
}

function removeFutureFields(
  filters: Record<string, unknown>,
): Record<string, unknown> {
  const cleaned = { ...filters };

  delete cleaned.allow_future_periods;
  delete cleaned.future_periods;
  delete cleaned.trailing_periods;

  return cleaned;
}

function toEntrataPropertyGroupId(value: string): number | string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function getBoxScoreSummarizeByValues(input: {
  inputFilters?: Record<string, unknown>;
  syncSettings: Record<string, unknown>;
}): string[] {
  /*
   * Default Box Score behavior:
   *   1. property_name - exact property/month total as Entrata reports it
   *   2. unit_type     - detail rows for unit-type analytics
   *
   * A manual run can override this with input.filters.summarize_by, for example:
   *   { summarize_by: "unit_type" }
   */
  const explicitValue =
    input.inputFilters?.summarize_by ?? input.syncSettings.boxScoreSummarizeBy;

  const values = Array.isArray(explicitValue)
    ? explicitValue
    : typeof explicitValue === "string" && explicitValue.trim().length > 0
      ? explicitValue.split(",")
      : ["property_name", "unit_type"];

  const normalized = values
    .map((value) => getString(value)?.trim())
    .filter((value): value is string => !!value && value.length > 0);

  return Array.from(
    new Set(
      normalized.length > 0 ? normalized : ["property_name", "unit_type"],
    ),
  );
}

function getPropertyNameFromReportRow(row: JsonObject): string {
  return (
    getString(row.property) ??
    getString(row.property_name) ??
    getString(row.lookup_code) ??
    "Unknown"
  );
}

function groupBoxScoreReportDataByProperty(
  reportData: JsonObject,
): JsonObject[] {
  /*
   * Box Score can be requested for multiple property_group_ids in one call.
   * Entrata returns one reportData object with arrays containing rows for all requested properties.
   * Stage one payload per property so the transformer can upsert by property/month safely.
   */
  const sectionNames = [
    "availability",
    "property_pulse",
    "lead_activity",
    "lead_conversions",
    "make_ready",
  ];

  const grouped = new Map<string, JsonObject>();

  for (const sectionName of sectionNames) {
    for (const row of asArray(reportData[sectionName])) {
      const propertyName = getPropertyNameFromReportRow(row);
      const existing = grouped.get(propertyName) ?? {};
      const rows = asArray(existing[sectionName]);
      rows.push(row);
      existing[sectionName] = rows;
      grouped.set(propertyName, existing);
    }
  }

  return Array.from(grouped.values());
}

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function clampFuturePeriodForReport(input: {
  reportCode: string;
  periodStart: string;
  periodEnd: string;
}): { periodStart: string; periodEnd: string } | null {
  if (!isBoxReport(input.reportCode)) {
    return {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    };
  }

  const today = getTodayIsoDate();

  if (input.periodStart > today) {
    return null;
  }

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd > today ? today : input.periodEnd,
  };
}

function buildSourceRecordId(
  reportCode: string,
  row: JsonObject,
  sourceKeyFields: string[],
  rowIndex: number,
  filters?: Record<string, unknown>,
): string {
  /*
   * For most reports, sourceKeyFields are available on the row.
   * Box Score is staged as the whole reportData object, so it does not have a top-level
   * property/month key. Include request filters to avoid duplicate sourceRecordId values
   * across property/month batches.
   */
  const keyValues = sourceKeyFields.map((field) => {
    const value = row[field];
    return getString(value) ?? "null";
  });

  const filterObject = filters ?? {};
  const period = asObject(filterObject.period);
  const propertyGroupIds = filterObject.property_group_ids;
  const propertyCodes = Array.isArray(propertyGroupIds)
    ? propertyGroupIds.map((item) => getString(item) ?? "null").join(",")
    : (getString(propertyGroupIds) ?? "null");

  const rowPropertyName = (() => {
    const availabilityRow = asArray(row.availability)[0];
    const pulseRow = asArray(row.property_pulse)[0];
    return (
      getString(asObject(availabilityRow).property) ??
      getString(asObject(availabilityRow).property_name) ??
      getString(asObject(pulseRow).property) ??
      getString(asObject(pulseRow).property_name) ??
      "null"
    );
  })();

  const requestKeyValues = [
    propertyCodes.length > 32 ? createHash("md5").update(propertyCodes).digest("hex") : propertyCodes,
    rowPropertyName,
    getString(period["daterange-start"]) ?? "null",
    getString(period["daterange-end"]) ?? "null",
    getString(filterObject.summarize_by) ?? "null",
  ];

  return `${reportCode}:${keyValues.join("|")}:${requestKeyValues.join("|")}:${rowIndex}`;
}

function getReportRows(reportCode: string, response: unknown): JsonObject[] {
  const responseObject = asObject(response);
  const responseWrapper = asObject(responseObject.response);
  const resultArray = asArray(responseWrapper.result);

  const firstResult = resultArray[0];

  if (!firstResult) {
    return [];
  }

  const reportData = asObject(firstResult).reportData;

  /*
   * Most Entrata reports return reportData as an array.
   * Box Score returns reportData as an object with sections:
   * availability, property_pulse, lead_activity, lead_conversions, make_ready.
   *
   * For Box Score we stage the whole reportData object as one row because the transformer
   * needs to combine the sections into one monthly occupancy source row.
   */
  if (
    reportCode === "box_score" &&
    reportData &&
    typeof reportData === "object" &&
    !Array.isArray(reportData)
  ) {
    return groupBoxScoreReportDataByProperty(reportData as JsonObject);
  }

  if (
    reportData &&
    typeof reportData === "object" &&
    !Array.isArray(reportData) &&
    Array.isArray((reportData as JsonObject).budget)
  ) {
    return asArray((reportData as JsonObject).budget);
  }

  return asArray(reportData);
}

const BUDGET_REPORT_MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

async function updatePropertiesFiscalFromBudgetReportResponse(input: {
  companyId: string;
  organisationId: string;
  rows: JsonObject[];
  filters?: Record<string, unknown>;
  fiscalYear?: number;
}): Promise<void> {
  if (input.rows.length === 0) return;

  const rowsByLookupCode = new Map<string, JsonObject[]>();
  const fallbackGroupIds = asArray(input.filters?.property_group_ids)
    .map((id) => getString(id))
    .filter((id): id is string => !!id);

  for (const row of input.rows) {
    const code = getString(row.lookup_code) ?? (fallbackGroupIds.length === 1 ? fallbackGroupIds[0] : null);
    if (!code) continue;
    const list = rowsByLookupCode.get(code) ?? [];
    list.push(row);
    rowsByLookupCode.set(code, list);
  }

  for (const [propCode, propRows] of rowsByLookupCode.entries()) {
    const sampleRow = propRows.find((r) =>
      Object.keys(r).some((k) => /^[a-z]{3}_\d{4}$/i.test(k))
    );
    if (!sampleRow) continue;

    const parsedMonths = Object.keys(sampleRow)
      .filter((k) => /^[a-z]{3}_\d{4}$/i.test(k))
      .map((k) => {
        const parts = k.split("_");
        const mNum = BUDGET_REPORT_MONTH_MAP[(parts[0] ?? "").toLowerCase()];
        const yNum = Number.parseInt(parts[1] ?? "", 10);
        if (!mNum || Number.isNaN(yNum)) return null;
        return { year: yNum, month: mNum, absMonth: yNum * 12 + (mNum - 1) };
      })
      .filter((m): m is { year: number; month: number; absMonth: number } => m !== null)
      .sort((a, b) => a.absMonth - b.absMonth);

    if (parsedMonths.length === 0) continue;

    const firstMonth = parsedMonths[0]!;
    const lastMonth = parsedMonths[parsedMonths.length - 1]!;
    const startMonth = firstMonth.month;
    const endMonth = lastMonth.month;

    const targetBudgetYear = new Date().getUTCFullYear() + 1;
    const fiscalStartDate = new Date(Date.UTC(targetBudgetYear, startMonth - 1, 1));
    const fiscalEndDate = new Date(
      Date.UTC(endMonth < startMonth ? targetBudgetYear + 1 : targetBudgetYear, endMonth, 0)
    );
    const budgetYearType = startMonth === 1 ? "CALENDAR_YEAR" : "FISCAL_YEAR";

    const numericCode = Number.parseInt(propCode, 10);
    const validNumericCode = Number.isInteger(numericCode) && numericCode > 0 ? numericCode : null;

    const prop = await prisma.property.findFirst({
      where: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        OR: [
          { code: propCode },
          ...(validNumericCode !== null ? [{ externalId: validNumericCode }] : [])
        ]
      },
      select: {
        id: true,
        budgetYear: true,
        budgetYearType: true,
        fiscalYearStartMonth: true,
        fiscalYearEndMonth: true,
        fiscalYearStartDate: true,
        fiscalYearEndDate: true
      }
    });

    if (!prop) continue;

    const isSame =
      prop.budgetYear === targetBudgetYear &&
      prop.budgetYearType === budgetYearType &&
      prop.fiscalYearStartMonth === startMonth &&
      prop.fiscalYearEndMonth === endMonth &&
      prop.fiscalYearStartDate?.toISOString().slice(0, 10) === fiscalStartDate.toISOString().slice(0, 10) &&
      prop.fiscalYearEndDate?.toISOString().slice(0, 10) === fiscalEndDate.toISOString().slice(0, 10);

    if (!isSame) {
      const systemAdminUserId = await resolveSystemAdminUserId(prisma);
      await prisma.property.update({
        where: { id: prop.id },
        data: {
          budgetYear: targetBudgetYear,
          budgetYearType,
          fiscalYearStartMonth: startMonth,
          fiscalYearEndMonth: endMonth,
          fiscalYearStartDate: fiscalStartDate,
          fiscalYearEndDate: fiscalEndDate,
          updatedSource: "ENTRATA",
          ...(systemAdminUserId ? { updatedBy: systemAdminUserId } : {})
        }
      });
      console.log(
        `[SyncEntrataReportDataJob] Updated Property ${propCode} (${prop.id}) fiscal config from budget report: ` +
          `type=${budgetYearType}, start=${fiscalStartDate.toISOString().slice(0, 10)}, end=${fiscalEndDate.toISOString().slice(0, 10)}`
      );
    }
  }
}

function getReportFilters(defaultParamsJson: unknown): Record<string, unknown> {
  const defaultParams = asObject(defaultParamsJson);

  if (
    defaultParams.filters &&
    typeof defaultParams.filters === "object" &&
    !Array.isArray(defaultParams.filters)
  ) {
    return defaultParams.filters as Record<string, unknown>;
  }

  return defaultParams;
}

function getMonthRanges(input: {
  fiscalYear?: number;
  periodStart?: string;
  periodEnd?: string;
  fiscalYearStartMonth?: number | null;
}): Array<{ periodStart: string; periodEnd: string }> {
  if (input.periodStart && input.periodEnd) {
    return [
      {
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
    ];
  }

  if (!input.fiscalYear) {
    throw new IntegrationError({
      message:
        "fiscalYear is required for occupancy report sync unless periodStart and periodEnd are provided.",
      code: "REPORT_PERIOD_MISSING",
      category: "VALIDATION_ERROR",
      retryable: false,
      context: { ...input },
    });
  }

  const startMonth =
    input.fiscalYearStartMonth &&
    input.fiscalYearStartMonth >= 1 &&
    input.fiscalYearStartMonth <= 12
      ? input.fiscalYearStartMonth
      : 1;

  return Array.from({ length: 12 }, (_, i) => {
    const totalMonthIndex = startMonth - 1 + i;
    const yearOffset = Math.floor(totalMonthIndex / 12);
    const monthInYear = totalMonthIndex % 12;

    const year = input.fiscalYear! + yearOffset;
    const start = new Date(Date.UTC(year, monthInYear, 1));
    const end = new Date(Date.UTC(year, monthInYear + 1, 0));

    return {
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
    };
  });
}

function getMonthIndexFromIsoDate(value: string): number {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new IntegrationError({
      message: `Invalid report period date: ${value}`,
      code: "REPORT_PERIOD_INVALID",
      category: "VALIDATION_ERROR",
      retryable: false,
      context: { value },
    });
  }

  return date.getUTCMonth();
}

function getResidentRetentionFuturePeriodsToFiscalYearEnd(
  periodStart: string,
  fiscalStartMonth = 1,
): number {
  const calMonth = getMonthIndexFromIsoDate(periodStart) + 1;
  const fStart =
    fiscalStartMonth >= 1 && fiscalStartMonth <= 12 ? fiscalStartMonth : 1;
  const fiscalOffset = ((calMonth - fStart) % 12 + 12) % 12;

  return Math.max(0, 11 - fiscalOffset);
}

function getResidentRetentionYearStartRange(
  year: number,
  fiscalStartMonth = 1,
): {
  periodStart: string;
  periodEnd: string;
} {
  const m =
    fiscalStartMonth >= 1 && fiscalStartMonth <= 12 ? fiscalStartMonth : 1;
  const start = new Date(Date.UTC(year, m - 1, 1));
  const end = new Date(Date.UTC(year, m, 0));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  };
}

function getCurrentFiscalYear(fiscalStartMonth = 1): number {
  const now = new Date();
  const calYear = now.getUTCFullYear();
  const calMonth = now.getUTCMonth() + 1;
  const startMonth =
    fiscalStartMonth >= 1 && fiscalStartMonth <= 12 ? fiscalStartMonth : 1;
  return calMonth < startMonth ? calYear - 1 : calYear;
}

function buildOccupancyReportFilters(input: {
  reportCode: string;
  propertyCodes: string[];
  periodStart?: string;
  periodEnd?: string;
  periodType?: string;
  baseFilters: Record<string, unknown>;
  residentRetentionFuturePeriods?: number | undefined;
  summarizeBy?: string | undefined;
}): Record<string, unknown> {
  const basePeriod = asObject(input.baseFilters.period);

  if (normalizeReportCode(input.reportCode) === "box_score") {
    const boxScorePeriod = removeFuturePeriodFields(basePeriod);
    const boxScoreFilters = removeFutureFields(input.baseFilters);

    return {
      ...boxScoreFilters,
      property_group_ids: input.propertyCodes,
      period: {
        ...boxScorePeriod,
        period_type: input.periodType ?? "daterange",
        ...(input.periodStart ? { "daterange-start": input.periodStart } : {}),
        ...(input.periodEnd ? { "daterange-end": input.periodEnd } : {}),
      },
      summarize_by: input.summarizeBy ?? "unit_type",
      consolidate_by: input.baseFilters.consolidate_by ?? "no_consolidation",
      rows_with_no_data: input.baseFilters.rows_with_no_data ?? "1",
      data_set: input.baseFilters.data_set ?? "",
      show_drill_ins: input.baseFilters.show_drill_ins ?? "1",
    };
  }

  if (normalizeReportCode(input.reportCode) === "resident_retention") {
    const isCurrentFyr =
      input.periodType === "currentfyr" ||
      basePeriod.period_type === "currentfyr";

    const period = isCurrentFyr
      ? {
          period_type: "currentfyr",
        }
      : {
          ...basePeriod,
          period_type: input.periodType ?? basePeriod.period_type ?? "daterange",
          ...(input.periodStart ? { "daterange-start": input.periodStart } : {}),
          ...(input.periodEnd ? { "daterange-end": input.periodEnd } : {}),
          allow_future_periods: basePeriod.allow_future_periods ?? "1",
          trailing_periods: basePeriod.trailing_periods ?? 0,
          future_periods:
            input.residentRetentionFuturePeriods ??
            basePeriod.future_periods ??
            0,
        };

    return {
      ...input.baseFilters,
      property_group_ids: input.propertyCodes.map(toEntrataPropertyGroupId),
      period,
      summarize_by: input.baseFilters.summarize_by ?? "month",
      consolidate_by: input.baseFilters.consolidate_by ?? "no_consolidation",
      lease_status: input.baseFilters.lease_status ?? "all",
      early_move_out_grace_period:
        input.baseFilters.early_move_out_grace_period ?? "31",
      drill_in_column: input.baseFilters.drill_in_column ?? "",
      unit_type_id: input.baseFilters.unit_type_id ?? "",
      property_floorplan_id: input.baseFilters.property_floorplan_id ?? "",
      month_id: input.baseFilters.month_id ?? "",
      year_id: input.baseFilters.year_id ?? "",
      previous_summarize_by: input.baseFilters.previous_summarize_by ?? "",
      show_drill_ins: input.baseFilters.show_drill_ins ?? "1",
    };
  }

  throw new Error(`Unsupported occupancy reportCode: ${input.reportCode}`);
}

async function getDistinctPropertyCodes(input: {
  companyId: string;
  organisationId: string;
  fiscalYear?: number | undefined;
}): Promise<string[]> {
  console.log("Fetching property codes for report batching", {
    companyId: input.companyId,
    organisationId: input.organisationId,
    fiscalYear: input.fiscalYear,
  });

  let pycs = await prisma.propertyYearConfiguration.findMany({
    where: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      ...(input.fiscalYear !== undefined ? { fiscalYear: input.fiscalYear } : {}),
      isActive: true,
      isDemo: false,
    },
    select: {
      propertyCode: true,
    },
    distinct: ["propertyCode"],
    orderBy: {
      propertyCode: "asc",
    },
  });

  // Fallback 1: If no configurations match the requested fiscalYear, query active non-demo configs without fiscalYear constraint
  if (pycs.length === 0 && input.fiscalYear !== undefined) {
    pycs = await prisma.propertyYearConfiguration.findMany({
      where: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        isActive: true,
        isDemo: false,
      },
      select: {
        propertyCode: true,
      },
      distinct: ["propertyCode"],
      orderBy: {
        propertyCode: "asc",
      },
    });
  }

  let propertyCodes = pycs
    .map((pyc) => pyc.propertyCode)
    .filter((value): value is string => !!value && value.trim().length > 0);

  // Fallback 2: If still no property codes, query active properties from properties table
  if (propertyCodes.length === 0) {
    const props = await prisma.property.findMany({
      where: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        isDisabled: false,
      },
      select: {
        code: true,
        externalId: true,
      },
      orderBy: {
        code: "asc",
      },
    });

    propertyCodes = props
      .map((p) => p.code ?? (p.externalId ? String(p.externalId) : null))
      .filter((value): value is string => !!value && value.trim().length > 0);
  }

  console.log("Property codes fetched successfully.", {
    count: propertyCodes.length,
    sample: propertyCodes.slice(0, 10),
  });

  return propertyCodes;
}

export async function syncEntrataReportDataJob(
  input: SyncEntrataReportDataJobInput,
): Promise<SyncEntrataReportDataJobResult> {
  console.log("Starting Entrata ReportData sync.", {
    reportCode: input.reportCode,
    propertyIds: input.propertyIds,
    fiscalYear: input.fiscalYear,
    includePriorYear: input.includePriorYear,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });

  const source = await prisma.integrationSource.findFirst({
    where: {
      id: input.integrationSourceId,
      companyId: input.companyId,
      organisationId: input.organisationId,
      sourceType: "entrata",
      isActive: true,
    },
    include: {
      config: true,
    },
  });

  if (!source?.config) {
    throw new IntegrationError({
      message: "No active Entrata source config found for report sync.",
      code: "ENTRATA_SOURCE_CONFIG_MISSING",
      category: "CONFIGURATION_ERROR",
      retryable: false,
      context: { ...input },
    });
  }

  let reportDefinition = await prisma.integrationReportDefinition.findFirst({
    where: {
      integrationSourceId: input.integrationSourceId,
      reportCode: input.reportCode,
      isEnabled: true,
    },
  });

  if (
    !reportDefinition &&
    normalizeReportCode(input.reportCode) === "resident_retention"
  ) {
    reportDefinition = await prisma.integrationReportDefinition.create({
      data: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        reportCode: "resident_retention",
        reportName: "resident_retention",
        displayName: "Resident Retention",
        description:
          "Entrata resident_retention report used to sync monthly lease expirations and renewals.",
        reportVersion: "3.1",
        methodVersion: "r2",
        entityName: "Occupancy",
        endpointPath: "reports",
        methodName: "getReportData",
        sourceKeyFieldsJson: ["property_name", "months"],
        defaultParamsJson: {
          filters: {
            period: {
              period_type: "currentfyr",
            },
            summarize_by: "month",
            consolidate_by: "no_consolidation",
            lease_status: "all",
            early_move_out_grace_period: "31",
            drill_in_column: "",
            unit_type_id: "",
            property_floorplan_id: "",
            month_id: "",
            year_id: "",
            previous_summarize_by: "",
            show_drill_ins: "1",
          },
        },
        syncSettingsJson: {
          minDelayMs: 1200,
          requestBatchSize: 1,
        },
        isSystemDefined: true,
        isCustomReport: false,
        isEnabled: true,
      },
    });
  }

  if (!reportDefinition) {
    throw new IntegrationError({
      message: `Report definition not found for reportCode: ${input.reportCode}`,
      code: "REPORT_DEFINITION_MISSING",
      category: "CONFIGURATION_ERROR",
      retryable: false,
      context: { ...input },
    });
  }

  const connectionJson = asObject(source.config.connectionJson);
  const credentialsJson = asObject(source.config.credentialsJson);

  const baseUrl =
    getString(connectionJson.baseUrl) ?? "https://apis.entrata.com";

  const orgSlug = getString(connectionJson.orgSlug);

  if (!orgSlug) {
    throw new IntegrationError({
      message:
        "Entrata orgSlug is missing in IntegrationSourceConfig.connectionJson.",
      code: "ENTRATA_ORG_SLUG_MISSING",
      category: "CONFIGURATION_ERROR",
      retryable: false,
      context: { ...input },
    });
  }

  const apiKeyRef = getString(credentialsJson.apiKeyRef);
  let apiKey: string | undefined;

  if (apiKeyRef?.startsWith("env://")) {
    const envKey = apiKeyRef.replace("env://", "");
    apiKey = process.env[envKey];
  }

  if (!apiKey) {
    apiKey = getString(credentialsJson.apiKey);
  }

  if (!apiKey) {
    throw new IntegrationError({
      message: "Entrata API key not configured.",
      code: "ENTRATA_API_KEY_MISSING",
      category: "CONFIGURATION_ERROR",
      retryable: false,
      context: { ...input },
    });
  }

  const syncSettings = asObject(reportDefinition.syncSettingsJson);

  console.log(`[STEP 1/3: SYNC START] Syncing report data for reportCode: ${input.reportCode}`, {
    companyId: input.companyId,
    organisationId: input.organisationId,
    integrationSourceId: input.integrationSourceId,
    reportCode: input.reportCode,
    fiscalYear: input.fiscalYear,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    propertyIds: input.propertyIds,
  });

  const connector = new EntrataReportsConnector(
    {
      baseUrl,
      orgSlug,
      minDelayMs: getNumberFromJson(syncSettings.minDelayMs, 1200),
    },
    {
      apiKey,
    },
  );

  const reportName =
    getString(reportDefinition.reportName) ?? reportDefinition.reportCode;

  const reportVersion =
    getString(reportDefinition.reportVersion) ??
    (normalizeReportCode(input.reportCode) === "resident_retention"
      ? "3.1"
      : undefined);
  const methodVersion = getString(reportDefinition.methodVersion) ?? "r2";

  const sourceKeyFields = getStringArray(reportDefinition.sourceKeyFieldsJson)
    .map((item) => getString(item))
    .filter((item): item is string => !!item);

  const defaultFilters = getReportFilters(reportDefinition.defaultParamsJson);

  const baseFilters: Record<string, unknown> = {
    ...defaultFilters,
    ...(input.filters ?? {}),
  };

  const requestedPropertyIds =
    input.propertyIds
      ?.map((value) => String(value ?? "").trim())
      .filter((value) => value.length > 0) ?? [];

  const configuredRequestBatchSize = getNumberFromJson(
    syncSettings.requestBatchSize,
    10,
  );
  const requestBatchSize =
    Number.isFinite(configuredRequestBatchSize) &&
    configuredRequestBatchSize > 0
      ? Math.floor(configuredRequestBatchSize)
      : 10;

  const configuredBatchFilterKey = getString(syncSettings.batchFilterKey);
  const batchSource = getString(syncSettings.batchSource);

  const batchFilterKey =
    configuredBatchFilterKey ??
    (input.reportCode === "property_closings"
      ? "property_group_ids"
      : undefined);

  let filterBatches: Record<string, unknown>[] = [baseFilters];
  let syncedPropertyCodes: string[] = [];

  if (isOccupancyReport(input.reportCode)) {
    let propertyCodes =
      requestedPropertyIds.length > 0
        ? requestedPropertyIds
        : await getDistinctPropertyCodes({
            companyId: input.companyId,
            organisationId: input.organisationId,
            fiscalYear: input.fiscalYear ?? new Date().getFullYear(),
          });

    propertyCodes = propertyCodes.filter(
      (value): value is string => !!value && value.trim().length > 0,
    );

    syncedPropertyCodes = propertyCodes;

    if (propertyCodes.length === 0) {
      throw new IntegrationError({
        message: "No property codes found for occupancy report sync.",
        code: "REPORT_PROPERTY_CODES_MISSING",
        category: "VALIDATION_ERROR",
        retryable: false,
        context: {
          ...input,
          requestedPropertyIds,
        },
      });
    }

    const basePeriod = asObject(baseFilters.period);
    const isCurrentFyrRequested = basePeriod.period_type === "currentfyr";

    const years =
      input.periodStart && input.periodEnd
        ? [input.fiscalYear]
        : input.fiscalYear
          ? input.includePriorYear
            ? [input.fiscalYear - 1, input.fiscalYear]
            : [input.fiscalYear]
          : isCurrentFyrRequested
            ? [new Date().getUTCFullYear()]
            : [];

    if (
      years.length === 0 &&
      !(input.periodStart && input.periodEnd) &&
      !isCurrentFyrRequested
    ) {
      throw new IntegrationError({
        message: `${input.reportCode} sync requires fiscalYear, periodStart/periodEnd, or period_type currentfyr.`,
        code: "REPORT_PERIOD_MISSING",
        category: "VALIDATION_ERROR",
        retryable: false,
        context: { ...input },
      });
    }

    const numericPropertyCodes = propertyCodes
      .map((code) => Number.parseInt(code, 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    const propertyRecords = await prisma.property.findMany({
      where: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        OR: [
          { code: { in: propertyCodes } },
          ...(numericPropertyCodes.length > 0
            ? [{ externalId: { in: numericPropertyCodes } }]
            : []),
        ],
      },
      select: {
        id: true,
        code: true,
        externalId: true,
        fiscalYearStartMonth: true,
      },
    });

    const fiscalStartMonthByCode = new Map<string, number>();
    for (const prop of propertyRecords) {
      const startMonth =
        prop.fiscalYearStartMonth &&
        prop.fiscalYearStartMonth >= 1 &&
        prop.fiscalYearStartMonth <= 12
          ? prop.fiscalYearStartMonth
          : 1;
      if (prop.code) fiscalStartMonthByCode.set(prop.code, startMonth);
      if (prop.externalId)
        fiscalStartMonthByCode.set(String(prop.externalId), startMonth);
    }

    const propertyCodesByStartMonth = new Map<number, string[]>();
    for (const code of propertyCodes) {
      const startMonth = fiscalStartMonthByCode.get(code) ?? 1;
      const list = propertyCodesByStartMonth.get(startMonth) ?? [];
      list.push(code);
      propertyCodesByStartMonth.set(startMonth, list);
    }

    const boxScoreSummarizeByValues =
      normalizeReportCode(input.reportCode) === "box_score"
        ? getBoxScoreSummarizeByValues({
            ...(input.filters ? { inputFilters: input.filters } : {}),
            syncSettings,
          })
        : [];

    filterBatches = [];
    let skippedFutureRangeCount = 0;

    for (const [
      startMonth,
      groupCodes,
    ] of propertyCodesByStartMonth.entries()) {
      const propertyCodeBatches = chunkArray(groupCodes, requestBatchSize);

      for (const propertyCodeBatch of propertyCodeBatches) {
        const cleanPropertyCodeBatch = propertyCodeBatch.filter(
          (value): value is string => !!value && value.trim().length > 0,
        );

        if (cleanPropertyCodeBatch.length === 0) {
          continue;
        }

        if (input.periodStart && input.periodEnd) {
          const safeRange = clampFuturePeriodForReport({
            reportCode: input.reportCode,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
          });

          if (!safeRange) {
            skippedFutureRangeCount += cleanPropertyCodeBatch.length;
            continue;
          }

          if (normalizeReportCode(input.reportCode) === "box_score") {
            for (const summarizeBy of boxScoreSummarizeByValues) {
              filterBatches.push(
                buildOccupancyReportFilters({
                  reportCode: input.reportCode,
                  propertyCodes: cleanPropertyCodeBatch,
                  periodStart: safeRange.periodStart,
                  periodEnd: safeRange.periodEnd,
                  baseFilters,
                  summarizeBy,
                }),
              );
            }
          } else {
            // Keep Resident Retention single-property for now because future periods and row shapes
            // are easier to validate per property. Box Score is the expensive month-by-month report.
            for (const propertyCode of cleanPropertyCodeBatch) {
              if (
                normalizeReportCode(input.reportCode) === "resident_retention" &&
                isCurrentFyrRequested
              ) {
                filterBatches.push(
                  buildOccupancyReportFilters({
                    reportCode: input.reportCode,
                    propertyCodes: [propertyCode],
                    periodType: "currentfyr",
                    baseFilters,
                  }),
                );
              } else {
                filterBatches.push(
                  buildOccupancyReportFilters({
                    reportCode: input.reportCode,
                    propertyCodes: [propertyCode],
                    periodStart: safeRange.periodStart,
                    periodEnd: safeRange.periodEnd,
                    baseFilters,
                    residentRetentionFuturePeriods:
                      normalizeReportCode(input.reportCode) === "resident_retention"
                        ? getResidentRetentionFuturePeriodsToFiscalYearEnd(
                            safeRange.periodStart,
                            startMonth,
                          )
                        : undefined,
                  }),
                );
              }
            }
          }

          continue;
        }

        for (const year of years) {
          if (!year) {
            continue;
          }

          if (normalizeReportCode(input.reportCode) === "resident_retention") {
            const isCurrentFyr =
              isCurrentFyrRequested ||
              year === getCurrentFiscalYear(startMonth);

            if (isCurrentFyr) {
              for (const propertyCode of cleanPropertyCodeBatch) {
                filterBatches.push(
                  buildOccupancyReportFilters({
                    reportCode: input.reportCode,
                    propertyCodes: [propertyCode],
                    periodType: "currentfyr",
                    baseFilters,
                  }),
                );
              }
              continue;
            }
          }

          const ranges =
            normalizeReportCode(input.reportCode) === "resident_retention"
              ? [getResidentRetentionYearStartRange(year, startMonth)]
              : getMonthRanges({
                  fiscalYear: year,
                  fiscalYearStartMonth: startMonth,
                });

          for (const range of ranges) {
            const safeRange = clampFuturePeriodForReport({
              reportCode: input.reportCode,
              periodStart: range.periodStart,
              periodEnd: range.periodEnd,
            });

            if (!safeRange) {
              skippedFutureRangeCount += cleanPropertyCodeBatch.length;
              continue;
            }

            if (normalizeReportCode(input.reportCode) === "box_score") {
              for (const summarizeBy of boxScoreSummarizeByValues) {
                filterBatches.push(
                  buildOccupancyReportFilters({
                    reportCode: input.reportCode,
                    propertyCodes: cleanPropertyCodeBatch,
                    periodStart: safeRange.periodStart,
                    periodEnd: safeRange.periodEnd,
                    baseFilters,
                    summarizeBy,
                  }),
                );
              }
            } else {
              for (const propertyCode of cleanPropertyCodeBatch) {
                filterBatches.push(
                  buildOccupancyReportFilters({
                    reportCode: input.reportCode,
                    propertyCodes: [propertyCode],
                    periodStart: safeRange.periodStart,
                    periodEnd: safeRange.periodEnd,
                    baseFilters,
                    residentRetentionFuturePeriods:
                      normalizeReportCode(input.reportCode) ===
                      "resident_retention"
                        ? getResidentRetentionFuturePeriodsToFiscalYearEnd(
                            safeRange.periodStart,
                            startMonth,
                          )
                        : undefined,
                  }),
                );
              }
            }
          }
        }
      }
    }

    console.log(
      "Occupancy report will be requested in report-specific batches.",
      {
        reportCode: input.reportCode,
        propertyCodeCount: propertyCodes.length,
        requestBatchSize,
        batchCount: filterBatches.length,
        source: requestedPropertyIds.length > 0 ? "REQUEST" : "PROPERTY_TABLE",
        fiscalYear: input.fiscalYear,
        includePriorYear: input.includePriorYear,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        skippedFutureRangeCount,
        boxScoreSummarizeByValues:
          normalizeReportCode(input.reportCode) === "box_score"
            ? boxScoreSummarizeByValues
            : undefined,
      },
    );
  } else if (
    batchFilterKey &&
    (batchSource === "PropertyCodes" ||
      input.reportCode === "property_closings")
  ) {
    let propertyCodes =
      requestedPropertyIds.length > 0
        ? requestedPropertyIds
        : await getDistinctPropertyCodes({
            companyId: input.companyId,
            organisationId: input.organisationId,
            fiscalYear:
              input.reportCode === "property_closings"
                ? input.fiscalYear
                : (input.fiscalYear ?? new Date().getFullYear()),
          });

    propertyCodes = propertyCodes.filter(
      (value): value is string => !!value && value.trim().length > 0,
    );

    if (propertyCodes.length === 0) {
      throw new IntegrationError({
        message: "No property codes found for report filter batching.",
        code: "REPORT_PROPERTY_CODES_MISSING",
        category: "VALIDATION_ERROR",
        retryable: false,
        context: {
          ...input,
          batchFilterKey,
          batchSource,
          requestedPropertyIds,
        },
      });
    }

    const propertyCodeBatches = chunkArray(propertyCodes, requestBatchSize);

    filterBatches = propertyCodeBatches.map((batch) => ({
      ...baseFilters,
      [batchFilterKey]: batch,
    }));

    console.log("Report will be requested in property batches.", {
      reportCode: input.reportCode,
      propertyCodeCount: propertyCodes.length,
      requestBatchSize,
      batchCount: filterBatches.length,
      batchFilterKey,
      source: requestedPropertyIds.length > 0 ? "REQUEST" : "PROPERTY_TABLE",
    });
  } else if (
    input.reportCode === "property_closings" &&
    requestedPropertyIds.length > 0
  ) {
    filterBatches = [
      {
        ...baseFilters,
        property_group_ids: requestedPropertyIds,
      },
    ];
  }

  filterBatches = filterBatches.map((filters) =>
    normalizeReportFilters(input.reportCode, filters),
  );

  console.log("Calling Entrata report API.", {
    reportCode: input.reportCode,
    reportName,
    methodVersion,
    timeoutMs: getNumberFromJson(syncSettings.timeoutMs, 30000),
    maxRetries: getNumberFromJson(syncSettings.maxRetries, 3),
    filterBatchCount: filterBatches.length,
  });

  console.log(`[STEP 1/3: BATCHES PREPARED] Generated ${filterBatches.length} filter batch(es) for reportCode: ${input.reportCode}`);

  const syncRun = await prisma.integrationSyncRun.create({
    data: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      integrationSourceId: input.integrationSourceId,
      entityName: "ReportData",
      syncType: "REPORT_DATA_SYNC",
      status: "STARTED",
      requestId: `entrata-report-${input.reportCode}-${Date.now()}`,
    },
  });

  const requestParamsJson: Prisma.InputJsonValue = {
    reportName,
    reportVersion: reportVersion ?? null,
    methodVersion,
    filters:
      filterBatches.length === 1
        ? (filterBatches[0] as Prisma.InputJsonValue)
        : ({
            baseFilters,
            generatedBatchCount: filterBatches.length,
            reportCode: input.reportCode,
            fiscalYear: input.fiscalYear ?? null,
            includePriorYear: input.includePriorYear ?? false,
            periodStart: input.periodStart ?? null,
            periodEnd: input.periodEnd ?? null,
          } as Prisma.InputJsonValue),
  };

  const reportRun = await prisma.integrationReportRun.create({
    data: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      integrationSourceId: input.integrationSourceId,
      reportDefinitionId: reportDefinition.id,
      syncRunId: syncRun.id,

      reportCode: reportDefinition.reportCode,
      reportName,
      reportVersion: reportVersion ?? null,
      methodVersion: methodVersion ?? null,

      requestParamsJson,

      status: "STARTED",
    },
  });

  let totalRows = 0;
  let staged = 0;
  let failedRequests = 0;

  const requestErrors: Array<{
    batchIndex: number;
    batchCount: number;
    requestId: string;
    filters: Record<string, unknown>;
    error: string;
  }> = [];

  try {
    for (let batchIndex = 0; batchIndex < filterBatches.length; batchIndex++) {
      const filters = filterBatches[batchIndex];

      if (!filters) {
        continue;
      }

      const normalizedFilters = normalizeReportFilters(
        input.reportCode,
        filters,
      );

      const requestId = `entrata-report-${input.reportCode}-${Date.now()}-${batchIndex + 1}`;

      console.log("Entrata report request filters:", {
        batchIndex: batchIndex + 1,
        batchCount: filterBatches.length,
        filters: normalizedFilters,
      });

      /*
       * IMPORTANT:
       * Keep error handling inside the batch loop.
       *
       * If one property/request fails, especially for resident_retention, the whole
       * sync should not stop. The failed request is recorded in staging_api_batches
       * with status FAILED, then the next property/request continues.
       */
      try {
        const response = await connector.fetchReportData({
          requestId,
          reportName,
          reportVersion,
          methodVersion,
          filters: normalizedFilters,
          timeoutMs: getNumberFromJson(syncSettings.timeoutMs, 30000),
          maxRetries: getNumberFromJson(syncSettings.maxRetries, 3),
          retryBaseDelayMs: getNumberFromJson(
            syncSettings.retryBaseDelayMs,
            60000,
          ),
        });

        console.log("Entrata report API response received.", {
          batchIndex: batchIndex + 1,
        });

        const rows = getReportRows(input.reportCode, response);
        totalRows += rows.length;

        if (
          input.updateFiscalConfig &&
          (normalizeReportCode(input.reportCode) === "budget" ||
            normalizeReportCode(reportName) === "budget")
        ) {
          await updatePropertiesFiscalFromBudgetReportResponse({
            companyId: input.companyId,
            organisationId: input.organisationId,
            rows,
            filters: normalizedFilters,
            ...(input.fiscalYear !== undefined ? { fiscalYear: input.fiscalYear } : {}),
          });
        }

        const stagingBatch = await prisma.stagingApiBatch.create({
          data: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,
            syncRunId: syncRun.id,

            entityName: "ReportData",
            sourceMethod: "getReportData",
            requestId,
            responseCode: 200,

            rawRequest: {
              method: "getReportData",
              methodVersion,
              reportName,
              reportVersion: reportVersion ?? null,
              filters: normalizedFilters as Prisma.InputJsonValue,
            } as Prisma.InputJsonValue,

            rawResponse: response as Prisma.InputJsonValue,
            status: "RECEIVED",
          },
        });

        const stagedRecords: Prisma.StagingReportDataCreateManyInput[] = [];

        for (let index = 0; index < rows.length; index++) {
          const row = rows[index];

          if (!row) {
            continue;
          }

          const sourceRecordId = buildSourceRecordId(
            reportDefinition.reportCode,
            row,
            sourceKeyFields,
            index,
            filters,
          );

          stagedRecords.push({
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,

            syncRunId: syncRun.id,
            stagingBatchId: stagingBatch.id,

            reportDefinitionId: reportDefinition.id,
            reportRunId: reportRun.id,

            reportCode: reportDefinition.reportCode,
            reportName,
            reportVersion: reportVersion ?? null,

            sourceRecordId,
            sourceHash: createSourceHash(row),
            rawRecordPayload: row as Prisma.InputJsonValue,

            validationStatus: "VALID",
            transformStatus: "PENDING",
          });
        }

        if (stagedRecords.length > 0) {
          await prisma.stagingReportData.createMany({
            data: stagedRecords,
          });
          staged += stagedRecords.length;
        }

        await prisma.stagingApiBatch.update({
          where: {
            id: stagingBatch.id,
          },
          data: {
            status: "PARSED",
          },
        });
      } catch (requestError) {
        failedRequests++;

        const errorMessage =
          requestError instanceof Error
            ? requestError.message
            : String(requestError);

        requestErrors.push({
          batchIndex: batchIndex + 1,
          batchCount: filterBatches.length,
          requestId,
          filters: normalizedFilters,
          error: errorMessage,
        });

        console.error(
          "Entrata report request failed. Continuing with next batch/property.",
          {
            reportCode: input.reportCode,
            batchIndex: batchIndex + 1,
            batchCount: filterBatches.length,
            requestId,
            filters: normalizedFilters,
            error: errorMessage,
          },
        );

        await prisma.stagingApiBatch.create({
          data: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,
            syncRunId: syncRun.id,

            entityName: "ReportData",
            sourceMethod: "getReportData",
            requestId,
            responseCode: null,

            rawRequest: {
              method: "getReportData",
              methodVersion,
              reportName,
              reportVersion: reportVersion ?? null,
              filters: normalizedFilters as Prisma.InputJsonValue,
            } as Prisma.InputJsonValue,

            rawResponse: {
              error: errorMessage,
            } as Prisma.InputJsonValue,

            status: "FAILED",
            errorMessage,
          },
        });

        continue;
      }
    }

    const finalStatus =
      failedRequests > 0 && staged > 0
        ? "PARTIAL_FAILED"
        : failedRequests > 0
          ? "FAILED"
          : "COMPLETED";

    await prisma.integrationReportRun.update({
      where: {
        id: reportRun.id,
      },
      data: {
        rowCount: totalRows,
        recordsStaged: staged,
        recordsFailed: failedRequests,
        status: finalStatus,
        completedAt: new Date(),
        responseSummaryJson: {
          totalRows,
          staged,
          failedRequests,
          requestErrors: requestErrors.slice(0, 50),
        } as Prisma.InputJsonValue,
      },
    });

    await prisma.integrationSyncRun.update({
      where: {
        id: syncRun.id,
      },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        recordsReceived: totalRows,
        recordsStaged: staged,
        recordsFailed: failedRequests,
      },
    });

    console.log(`[STEP 1/3: SYNC COMPLETE] Staged ${staged} row(s) from ${totalRows} received record(s) for reportCode: ${reportDefinition.reportCode}`, {
      syncRunId: syncRun.id,
      reportRunId: reportRun.id,
      recordsReceived: totalRows,
      recordsStaged: staged,
      failedRequests,
    });

    return {
      companyId: input.companyId,
      organisationId: input.organisationId,
      integrationSourceId: input.integrationSourceId,
      syncRunId: syncRun.id,
      reportRunId: reportRun.id,
      reportCode: reportDefinition.reportCode,
      recordsReceived: totalRows,
      recordsStaged: staged,
      recordsPendingTransform: staged,
      transformBatchSize: getNumberFromJson(
        syncSettings.transformBatchSize,
        100,
      ),
      propertyCodes:
        syncedPropertyCodes.length > 0
          ? syncedPropertyCodes
          : requestedPropertyIds.length > 0
            ? requestedPropertyIds
            : undefined,
      fiscalYear: input.fiscalYear,
    };
  } catch (error) {
    /*
     * Fatal error handler.
     *
     * This catches errors outside the per-request block, for example configuration,
     * database update failures, or unexpected code errors. Individual Entrata request
     * failures are already handled above and do not reach this block.
     */
    console.error("Entrata report sync failed.", {
      reportCode: input.reportCode,
      error,
    });

    await prisma.integrationReportRun.update({
      where: {
        id: reportRun.id,
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });

    await prisma.integrationSyncRun.update({
      where: {
        id: syncRun.id,
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });

    throw error;
  }
}

function normalizeReportFilters(
  reportCode: string,
  filters: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = structuredClone(filters) as Record<string, unknown>;

  if (isBoxReport(reportCode)) {
    delete normalized.allow_future_periods;
    delete normalized.future_periods;
    delete normalized.trailing_periods;

    const period = normalized.period;

    if (period && typeof period === "object" && !Array.isArray(period)) {
      normalized.period = removeFuturePeriodFields(
        period as Record<string, unknown>,
      );
    }
  }

  return normalized;
}
