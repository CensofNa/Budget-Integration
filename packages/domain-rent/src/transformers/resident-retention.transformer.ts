import type { PrismaClient } from "@prisma/client";
import {
  asObject,
  getDecimal,
  getString,
  parseDate
} from "@budget-integration/integration-core";
import { resolveFiscalYearForReportMonth } from "./box-score.transformer.js";

function normalizePropertyName(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const normalized = value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return normalized.length > 0 ? normalized : undefined;
}

function getRequestedPropertyCodeFromRawRequest(rawRequest: unknown): string | undefined {
  const request = asObject(rawRequest);
  const filters = asObject(request.filters);
  const propertyGroupIds = filters.property_group_ids;

  if (Array.isArray(propertyGroupIds)) {
    return getString(propertyGroupIds[0]);
  }

  return getString(propertyGroupIds);
}

async function getStagingContext(
  prisma: PrismaClient,
  stagingReportDataId: string,
  rawRequest?: unknown
): Promise<{ requestedPropertyCode?: string; periodStart?: Date; periodEnd?: Date }> {
  let requestObj = rawRequest;
  if (!requestObj) {
    const staging = await prisma.stagingReportData.findUnique({
      where: { id: stagingReportDataId },
      include: { stagingBatch: true }
    });

    if (!staging?.stagingBatch) {
      return {};
    }
    requestObj = staging.stagingBatch.rawRequest;
  }

  const request = asObject(requestObj);
  const filters = asObject(request.filters);
  const period = asObject(filters.period);

  const requestedPropertyCode = getRequestedPropertyCodeFromRawRequest(requestObj);
  const periodStart = parseDate(period["daterange-start"]);
  const periodEnd = parseDate(period["daterange-end"]);

  return {
    ...(requestedPropertyCode ? { requestedPropertyCode } : {}),
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd } : {})
  };
}

async function resolvePropertyForResidentRetention(
  prisma: PrismaClient,
  input: {
    companyId: string;
    organisationId: string;
    propertyName: string;
    requestedPropertyCode?: string;
    cachedProperties?: Array<{ id: string; code: string | null; externalId: number | null; name: string | null; fiscalYearStartMonth: number | null; reforecastLockedTillMonth?: number | null }>;
  }
): Promise<{ id: string; code: string | null; name: string | null; fiscalYearStartMonth: number | null; reforecastLockedTillMonth?: number | null }> {
  const normalizedReportPropertyName = normalizePropertyName(input.propertyName);

  if (!normalizedReportPropertyName) {
    throw new Error("Resident Retention row has an invalid property name.");
  }

  const properties =
    input.cachedProperties ??
    (await prisma.property.findMany({
      where: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        isDisabled: false
      },
      select: { id: true, code: true, externalId: true, name: true, fiscalYearStartMonth: true, reforecastLockedTillMonth: true }
    }));

  const nameMatches = properties.filter(
    (property) => normalizePropertyName(property.name ?? undefined) === normalizedReportPropertyName
  );

  if (nameMatches.length === 1) {
    return nameMatches[0]!;
  }

  if (nameMatches.length > 1 && input.requestedPropertyCode) {
    const requestedCodeMatch = nameMatches.find(
      (property) =>
        property.code === input.requestedPropertyCode ||
        (property.externalId !== null && String(property.externalId) === input.requestedPropertyCode)
    );

    if (requestedCodeMatch) return requestedCodeMatch;
  }

  if (input.requestedPropertyCode) {
    const requestedCodeProperty = properties.find(
      (property) =>
        property.code === input.requestedPropertyCode ||
        (property.externalId !== null && String(property.externalId) === input.requestedPropertyCode)
    );

    if (requestedCodeProperty) {
      throw new Error(
        `Resident Retention property name mismatch. Report returned "${input.propertyName}", ` +
        `but requested property code ${input.requestedPropertyCode} maps to ` +
        `"${requestedCodeProperty.name ?? "N/A"}".`
      );
    }
  }

  throw new Error(
    `Property not found for Resident Retention property name "${input.propertyName}". ` +
    `Requested property code: ${input.requestedPropertyCode ?? "N/A"}.`
  );
}

const monthMap: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

function parseReportMonth(value: unknown): Date {
  const raw = getString(value);

  if (!raw) {
    throw new Error("Resident Retention row is missing months.");
  }

  const parts = raw.split(/\s+/);
  const monthText = parts[0]?.toLowerCase().slice(0, 3);
  const yearText = parts[1];

  const monthIndex = monthText ? monthMap[monthText] : undefined;
  const year = yearText ? Number.parseInt(yearText, 10) : NaN;

  if (monthIndex === undefined || Number.isNaN(year)) {
    throw new Error(`Invalid Resident Retention month value: ${raw}`);
  }

  return new Date(Date.UTC(year, monthIndex, 1));
}

export async function transformResidentRetentionReport(
  prisma: PrismaClient,
  input: {
    stagingReportDataId: string;
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    sourceRecordId: string;
    sourceHash?: string | null;
    rawRecordPayload: unknown;
    rawRequest?: unknown;
    cachedProperties?: Array<{ id: string; code: string | null; externalId: number | null; name: string | null; fiscalYearStartMonth: number | null; reforecastLockedTillMonth?: number | null }>;
  }
): Promise<void> {
  const row = asObject(input.rawRecordPayload);

  const propertyName = getString(row.property) ?? getString(row.property_name);

  if (!propertyName) {
    throw new Error("Resident Retention row is missing property name.");
  }

  const reportMonth = parseReportMonth(row.months);
  const context = await getStagingContext(prisma, input.stagingReportDataId, input.rawRequest);

  const property = await resolvePropertyForResidentRetention(prisma, {
    companyId: input.companyId,
    organisationId: input.organisationId,
    propertyName,
    ...(context.requestedPropertyCode ? { requestedPropertyCode: context.requestedPropertyCode } : {}),
    ...(input.cachedProperties ? { cachedProperties: input.cachedProperties } : {})
  });

  const fiscalYear = resolveFiscalYearForReportMonth(
    reportMonth,
    property.fiscalYearStartMonth
  );

  const data = {
    companyId: input.companyId,
    organisationId: input.organisationId,
    propertyId: property.id,
    propertyCode: property.code ?? context.requestedPropertyCode ?? null,
    propertyName,
    fiscalYear,
    reportMonth,
    periodStart: context.periodStart ?? reportMonth,
    periodEnd:
      context.periodEnd ??
      new Date(Date.UTC(reportMonth.getUTCFullYear(), reportMonth.getUTCMonth() + 1, 0)),
    months: getString(row.months) ?? null,
    unitType: getString(row.unit_type) ?? null,
    floorPlan: getString(row.floor_plan) ?? getString(row.property_floorplan) ?? null,
    units: getDecimal(row.units),
    totalRentableUnits: getDecimal(row.total_rentable_units),
    expiringLeases: getDecimal(row.expiring_leases),
    earlyMoveOut: getDecimal(row.early_move_out),
    earlyMoveOutPercentage: getDecimal(row.early_move_out_percentage),
    ntv: getDecimal(row.ntv),
    ntvPercentage: getDecimal(row.ntv_percentage),
    renewals: getDecimal(row.renewals),
    renewalPercentage: getDecimal(row.renewal_percentage),
    renewalTransfers: getDecimal(row.renewal_transfers),
    renewalTransfersPercentage: getDecimal(row.renewal_transfers_percentage),
    transfers: getDecimal(row.transfers),
    transfersPercentage: getDecimal(row.transfers_percentage),
    pending: getDecimal(row.pending),
    pendingPercentage: getDecimal(row.pending_percentage),
    mtm: getDecimal(row.mtm),
    mtmPercentage: getDecimal(row.mtm_percentage)
  };

  // Store Resident Retention in its own canonical report table.
  // No raw JSON and no direct write to occupancy_transaction_detail here.
  await prisma.propertyResidentRetentionMonthly.upsert({
    where: {
      companyId_organisationId_propertyId_fiscalYear_reportMonth: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        propertyId: property.id,
        fiscalYear,
        reportMonth
      }
    },
    update: data,
    create: data
  });

  // Update lease_expirations and renewal_percent in occupancy_reforecast_details till reforecast_locked_till_month
  const reportMonthNum = reportMonth.getUTCMonth() + 1;
  if (
    property.reforecastLockedTillMonth &&
    reportMonthNum <= property.reforecastLockedTillMonth
  ) {
    const occupancyReforecast = await prisma.occupancyReforecast.findUnique({
      where: {
        propertyId_year: {
          propertyId: property.id,
          year: fiscalYear
        }
      },
      select: { id: true }
    });

    if (occupancyReforecast) {
      const updateData: {
        leaseExpirations?: number;
        renewalPercent?: number;
      } = {};

      if (data.expiringLeases !== null && data.expiringLeases !== undefined) {
        updateData.leaseExpirations = Math.round(Number(data.expiringLeases));
      }
      if (data.renewalPercentage !== null && data.renewalPercentage !== undefined) {
        updateData.renewalPercent = Number(data.renewalPercentage);
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.occupancyReforecastDetail.updateMany({
          where: {
            reforecastId: occupancyReforecast.id,
            month: reportMonthNum
          },
          data: updateData
        });
      }
    }
  }

  await prisma.stagingReportData.update({
    where: { id: input.stagingReportDataId },
    data: {
      validationStatus: "VALID",
      transformStatus: "TRANSFORMED",
      transformedAt: new Date()
    }
  });
}
