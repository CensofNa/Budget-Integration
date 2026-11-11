import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  asArray,
  asObject,
  getDecimal,
  getString,
  parseDate
} from "@budget-integration/integration-core";

type JsonObject = Record<string, unknown>;

type StagingContext = {
  reportMonth: Date;
  periodStart: Date;
  periodEnd: Date;
  requestedPropertyCode?: string;
  summarizeBy: string;
};

export function resolveFiscalYearForReportMonth(
  reportMonth: Date,
  fiscalStartMonth?: number | null
): number {
  const calYear = reportMonth.getUTCFullYear();
  const calMonth = reportMonth.getUTCMonth() + 1;
  const startMonth = fiscalStartMonth && fiscalStartMonth >= 1 && fiscalStartMonth <= 12 ? fiscalStartMonth : 1;

  if (calMonth < startMonth) {
    return calYear - 1;
  }
  return calYear;
}

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

function getStagingPeriod(rawRequest: unknown): { periodStart: Date; periodEnd: Date; reportMonth: Date } {
  const request = asObject(rawRequest);
  const filters = asObject(request.filters);
  const period = asObject(filters.period);

  const start = parseDate(period["daterange-start"]);
  const end = parseDate(period["daterange-end"]);

  if (!start || !end) {
    throw new Error("Box Score raw request is missing period.daterange-start or period.daterange-end.");
  }

  return {
    periodStart: start,
    periodEnd: end,
    reportMonth: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  };
}

async function getStagingContext(
  prisma: PrismaClient,
  stagingReportDataId: string,
  rawRequest?: unknown
): Promise<StagingContext> {
  let requestObj = rawRequest;
  if (!requestObj) {
    const staging = await prisma.stagingReportData.findUnique({
      where: { id: stagingReportDataId },
      include: { stagingBatch: true }
    });

    if (!staging?.stagingBatch) {
      throw new Error("Staging batch not found for Box Score transform.");
    }
    requestObj = staging.stagingBatch.rawRequest;
  }

  const request = asObject(requestObj);
  const filters = asObject(request.filters);
  const period = getStagingPeriod(requestObj);

  const requestedPropertyCode = getRequestedPropertyCodeFromRawRequest(requestObj);

  return {
    ...period,
    ...(requestedPropertyCode ? { requestedPropertyCode } : {}),
    summarizeBy: getString(filters.summarize_by) ?? "property_name"
  };
}

async function resolvePropertyForBoxScore(
  prisma: PrismaClient,
  input: {
    companyId: string;
    organisationId: string;
    propertyName: string;
    requestedPropertyCode?: string;
    responseLookupCode?: string;
    cachedProperties?: Array<{ id: string; code: string | null; externalId: number | null; name: string | null; fiscalYearStartMonth: number | null; reforecastLockedTillMonth?: number | null }>;
  }
): Promise<{ id: string; code: string | null; name: string | null; fiscalYearStartMonth: number | null; reforecastLockedTillMonth?: number | null }> {
  const normalizedReportPropertyName = normalizePropertyName(input.propertyName);

  if (!normalizedReportPropertyName) {
    throw new Error("Box Score report row has an invalid property name.");
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
        `Box Score property name mismatch. Report returned "${input.propertyName}", ` +
        `but requested property code ${input.requestedPropertyCode} maps to ` +
        `"${requestedCodeProperty.name ?? "N/A"}". Response lookup_code was "${input.responseLookupCode ?? "N/A"}".`
      );
    }
  }

  throw new Error(
    `Property not found for Box Score property name "${input.propertyName}". ` +
    `Requested property code: ${input.requestedPropertyCode ?? "N/A"}. ` +
    `Response lookup_code: ${input.responseLookupCode ?? "N/A"}.`
  );
}

function sectionRows(reportData: JsonObject, sectionName: string): JsonObject[] {
  return asArray(reportData[sectionName]);
}

function getUnitType(row: JsonObject): string {
  return getString(row.unit_type) ?? "Unknown";
}

function findFirstPropertyName(reportData: JsonObject): string | undefined {
  const sections = ["availability", "property_pulse", "lead_activity", "lead_conversions"];

  for (const section of sections) {
    for (const row of sectionRows(reportData, section)) {
      const propertyName = getString(row.property) ?? getString(row.property_name);
      if (propertyName) return propertyName;
    }
  }

  return undefined;
}

function firstRow(reportData: JsonObject, sectionName: string): JsonObject {
  return sectionRows(reportData, sectionName)[0] ?? {};
}

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function n(value: unknown): number | null {
  return decimalToNumber(getDecimal(value));
}

function sumNumbers(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return valid.reduce((total, value) => total + value, 0);
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function weightedAverage(rows: JsonObject[], valueField: string, weightField = "total_rentable_units"): number | null {
  let weightedTotal = 0;
  let weightTotal = 0;

  for (const row of rows) {
    const value = n(row[valueField]);
    const weight = n(row[weightField]);

    if (value === null || weight === null || weight === 0) continue;

    weightedTotal += value * weight;
    weightTotal += weight;
  }

  return weightTotal === 0 ? null : weightedTotal / weightTotal;
}

function toDecimal(value: number | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value);
}

function makeReadyMetric(reportData: JsonObject, status: "Ready" | "Not Ready", field: string): Prisma.Decimal | null {
  const row = sectionRows(reportData, "make_ready").find(
    (item) => getString(item.status)?.toLowerCase() === status.toLowerCase()
  );

  return row ? getDecimal(row[field]) : null;
}

function mergeRowsByUnitType(reportData: JsonObject): Map<string, Record<string, JsonObject>> {
  const rowsByUnitType = new Map<string, Record<string, JsonObject>>();
  const sectionNames = ["availability", "property_pulse", "lead_activity", "lead_conversions"];

  for (const sectionName of sectionNames) {
    for (const row of sectionRows(reportData, sectionName)) {
      const unitType = getUnitType(row);
      const existing = rowsByUnitType.get(unitType) ?? {};
      existing[sectionName] = row;
      rowsByUnitType.set(unitType, existing);
    }
  }

  return rowsByUnitType;
}

function commonUnitTypeData(input: {
  context: StagingContext;
  property: { id: string; code: string | null; fiscalYearStartMonth?: number | null };
  propertyName: string;
  unitType: string;
  rowSet: Record<string, JsonObject>;
  companyId: string;
  organisationId: string;
}) {
  const availability = input.rowSet.availability ?? {};
  const propertyPulse = input.rowSet.property_pulse ?? {};
  const leadActivity = input.rowSet.lead_activity ?? {};
  const leadConversions = input.rowSet.lead_conversions ?? {};

  return {
    companyId: input.companyId,
    organisationId: input.organisationId,
    propertyId: input.property.id,
    propertyCode: input.property.code ?? input.context.requestedPropertyCode ?? null,
    propertyName: input.propertyName,
    fiscalYear: resolveFiscalYearForReportMonth(input.context.reportMonth, input.property.fiscalYearStartMonth),
    reportMonth: input.context.reportMonth,
    periodStart: input.context.periodStart,
    periodEnd: input.context.periodEnd,
    unitType: input.unitType,
    unitTypeLookupCode: getString(availability.unit_type_lookup_code) ?? getString(propertyPulse.unit_type_lookup_code) ?? null,
    propertyFloorplan: getString(availability.property_floorplan) ?? null,
    buildingName: getString(availability.building_name) ?? null,
    numberOfBedrooms: getString(availability.number_of_bedrooms) ?? getString(propertyPulse.number_of_bedrooms) ?? null,
    numberOfBathrooms: getDecimal(availability.number_of_bathrooms),

    avgSquareFeet: getDecimal(availability.avg_square_feet),
    avgMarketRent: getDecimal(availability.avg_market_rent),
    scheduledRent: getDecimal(availability.scheduled_rent),
    avgBudgetedRent: getDecimal(availability.avg_budgeted_rent),
    scheduledCharges: getDecimal(availability.scheduled_charges),
    scheduledOther: getDecimal(availability.scheduled_other),
    effectiveRent: getDecimal(availability.effective_rent),
    actualRent: getDecimal(availability.actual_rent),

    totalUnits: getDecimal(availability.total_units),
    excludedUnits: getDecimal(availability.excluded_units),
    totalRentableUnits: getDecimal(availability.total_rentable_units ?? propertyPulse.total_rentable_units),
    occupiedUnits: getDecimal(availability.occupied_units),
    vacantUnits: getDecimal(availability.vacant_units),
    availableUnits: getDecimal(availability.available_units),
    occupiedNoNoticeUnits: getDecimal(availability.occupied_no_notice_units),
    noticeRentedUnits: getDecimal(availability.notice_rented_units),
    noticeUnrentedUnits: getDecimal(availability.notice_unrented_units),
    vacantRentedUnits: getDecimal(availability.vacant_rented_units),
    vacantUnrentedUnits: getDecimal(availability.vacant_unrented_units),
    percentOccupied: getDecimal(availability.percent_occupied),
    percentLeased: getDecimal(availability.percent_leased),
    avgNotExposedLeasedUnits: getDecimal(availability.avg_not_exposed_leased_units),
    avgExposure: getDecimal(availability.avg_exposure),

    moveIns: getDecimal(propertyPulse.move_ins),
    mtmStarted: getDecimal(propertyPulse.mtm_started),
    mtmConverted: getDecimal(propertyPulse.mtm_converted),
    renewalApplicationCompletions: getDecimal(propertyPulse.renewal_application_completions),
    renewalLeaseApprovals: getDecimal(propertyPulse.renewal_lease_approvals),
    renewalLeaseCreations: getDecimal(propertyPulse.renewal_lease_creations),
    transfersCompleted: getDecimal(propertyPulse.transfers_completed),
    notices: getDecimal(propertyPulse.notices),
    moveOuts: getDecimal(propertyPulse.move_outs),
    renewals: getDecimal(propertyPulse.renewals),
    renewalTransfers: getDecimal(propertyPulse.renewal_transfers),
    skips: getDecimal(propertyPulse.skips),
    leasesExpiring: getDecimal(propertyPulse.leases_expiring),
    evictionsCompleted: getDecimal(propertyPulse.evictions_completed),
    leasesApproved: getDecimal(propertyPulse.leases_approved),

    cloLeads: getDecimal(leadActivity.clo_leads ?? leadConversions.clo_leads),
    newLeads: getDecimal(leadActivity.new_leads ?? leadConversions.new_leads),
    email: getDecimal(leadActivity.email),
    call: getDecimal(leadActivity.call),
    online: getDecimal(leadActivity.online),
    referredContact: getDecimal(leadActivity.referred_contact),
    visitTour: getDecimal(leadActivity.visit_tour),
    offsite: getDecimal(leadActivity.offsite),
    chat: getDecimal(leadActivity.chat),
    text: getDecimal(leadActivity.text),
    other: getDecimal(leadActivity.other),
    leadEmail: getDecimal(leadActivity.lead_email),
    leadCall: getDecimal(leadActivity.lead_call),
    leadChat: getDecimal(leadActivity.lead_chat),
    leadText: getDecimal(leadActivity.lead_text),
    uniqueVisitsTours: getDecimal(leadActivity.unique_visits_tours),
    onsiteVisit: getDecimal(leadActivity.onsite_visit),
    unitTour: getDecimal(leadActivity.unit_tour),
    propertyTour: getDecimal(leadActivity.property_tour),
    selfGuidedTour: getDecimal(leadActivity.self_guided_tour),
    virtualTour: getDecimal(leadActivity.virtual_tour),

    prospectsCancelled: getDecimal(leadConversions.prospects_cancelled),
    started: getDecimal(leadConversions.started),
    applicationsPartiallyCompleted: getDecimal(leadConversions.applications_partially_completed),
    completed: getDecimal(leadConversions.completed),
    completedCancelled: getDecimal(leadConversions.completed_cancelled),
    denied: getDecimal(leadConversions.denied),
    approved: getDecimal(leadConversions.approved),
    approvedCancelled: getDecimal(leadConversions.approved_cancelled),
    leaseCompleted: getDecimal(leadConversions.lease_completed),
    leaseCompletedCancelled: getDecimal(leadConversions.lease_completed_cancelled),
    abandoned: getDecimal(leadConversions.abandoned),
    leaseApproved: getDecimal(leadConversions.lease_approved)
  };
}

function sumField(rows: JsonObject[], field: string): Prisma.Decimal | null {
  return toDecimal(sumNumbers(rows.map((row) => n(row[field]))));
}

function aggregateMonthlyData(input: {
  reportData: JsonObject;
  context: StagingContext;
  property: { id: string; code: string | null; fiscalYearStartMonth?: number | null };
  propertyName: string;
  companyId: string;
  organisationId: string;
}) {
  const availabilityRows = sectionRows(input.reportData, "availability");
  const pulseRows = sectionRows(input.reportData, "property_pulse");
  const activityRows = sectionRows(input.reportData, "lead_activity");
  const conversionRows = sectionRows(input.reportData, "lead_conversions");

  const totalRentableUnits = sumNumbers(availabilityRows.map((row) => n(row.total_rentable_units)));
  const occupiedUnits = sumNumbers(availabilityRows.map((row) => n(row.occupied_units)));
  const noticeRentedUnits = sumNumbers(availabilityRows.map((row) => n(row.notice_rented_units)));
  const vacantRentedUnits = sumNumbers(availabilityRows.map((row) => n(row.vacant_rented_units)));

  return {
    companyId: input.companyId,
    organisationId: input.organisationId,
    propertyId: input.property.id,
    propertyCode: input.property.code ?? input.context.requestedPropertyCode ?? null,
    propertyName: input.propertyName,
    fiscalYear: resolveFiscalYearForReportMonth(input.context.reportMonth, input.property.fiscalYearStartMonth),
    reportMonth: input.context.reportMonth,
    periodStart: input.context.periodStart,
    periodEnd: input.context.periodEnd,
    summarizeBy: "property_name",

    totalUnits: sumField(availabilityRows, "total_units"),
    excludedUnits: sumField(availabilityRows, "excluded_units"),
    totalRentableUnits: toDecimal(totalRentableUnits),
    occupiedUnits: toDecimal(occupiedUnits),
    vacantUnits: sumField(availabilityRows, "vacant_units"),
    availableUnits: sumField(availabilityRows, "available_units"),
    occupiedNoNoticeUnits: sumField(availabilityRows, "occupied_no_notice_units"),
    noticeRentedUnits: toDecimal(noticeRentedUnits),
    noticeUnrentedUnits: sumField(availabilityRows, "notice_unrented_units"),
    vacantRentedUnits: toDecimal(vacantRentedUnits),
    vacantUnrentedUnits: sumField(availabilityRows, "vacant_unrented_units"),
    percentOccupied: toDecimal(ratio(occupiedUnits, totalRentableUnits)),
    percentLeased: toDecimal(ratio(sumNumbers([occupiedUnits, noticeRentedUnits, vacantRentedUnits]), totalRentableUnits)),
    avgNotExposedLeasedUnits: toDecimal(weightedAverage(availabilityRows, "avg_not_exposed_leased_units")),
    avgExposure: toDecimal(weightedAverage(availabilityRows, "avg_exposure")),

    avgSquareFeet: toDecimal(weightedAverage(availabilityRows, "avg_square_feet")),
    avgMarketRent: toDecimal(weightedAverage(availabilityRows, "avg_market_rent")),
    scheduledRent: toDecimal(weightedAverage(availabilityRows, "scheduled_rent")),
    avgBudgetedRent: toDecimal(weightedAverage(availabilityRows, "avg_budgeted_rent")),
    scheduledCharges: toDecimal(weightedAverage(availabilityRows, "scheduled_charges")),
    scheduledOther: toDecimal(weightedAverage(availabilityRows, "scheduled_other")),
    effectiveRent: toDecimal(weightedAverage(availabilityRows, "effective_rent")),
    actualRent: toDecimal(weightedAverage(availabilityRows, "actual_rent")),

    moveIns: sumField(pulseRows, "move_ins"),
    mtmStarted: sumField(pulseRows, "mtm_started"),
    mtmConverted: sumField(pulseRows, "mtm_converted"),
    renewalApplicationCompletions: sumField(pulseRows, "renewal_application_completions"),
    renewalLeaseApprovals: sumField(pulseRows, "renewal_lease_approvals"),
    renewalLeaseCreations: sumField(pulseRows, "renewal_lease_creations"),
    transfersCompleted: sumField(pulseRows, "transfers_completed"),
    notices: sumField(pulseRows, "notices"),
    moveOuts: sumField(pulseRows, "move_outs"),
    renewals: sumField(pulseRows, "renewals"),
    renewalTransfers: sumField(pulseRows, "renewal_transfers"),
    skips: sumField(pulseRows, "skips"),
    leasesExpiring: sumField(pulseRows, "leases_expiring"),
    evictionsCompleted: sumField(pulseRows, "evictions_completed"),
    leasesApproved: sumField(pulseRows, "leases_approved"),

    cloLeads: sumField(activityRows, "clo_leads"),
    newLeads: sumField(activityRows, "new_leads"),
    email: sumField(activityRows, "email"),
    call: sumField(activityRows, "call"),
    online: sumField(activityRows, "online"),
    referredContact: sumField(activityRows, "referred_contact"),
    visitTour: sumField(activityRows, "visit_tour"),
    offsite: sumField(activityRows, "offsite"),
    chat: sumField(activityRows, "chat"),
    text: sumField(activityRows, "text"),
    other: sumField(activityRows, "other"),
    leadEmail: sumField(activityRows, "lead_email"),
    leadCall: sumField(activityRows, "lead_call"),
    leadChat: sumField(activityRows, "lead_chat"),
    leadText: sumField(activityRows, "lead_text"),
    uniqueVisitsTours: sumField(activityRows, "unique_visits_tours"),
    onsiteVisit: sumField(activityRows, "onsite_visit"),
    unitTour: sumField(activityRows, "unit_tour"),
    propertyTour: sumField(activityRows, "property_tour"),
    selfGuidedTour: sumField(activityRows, "self_guided_tour"),
    virtualTour: sumField(activityRows, "virtual_tour"),

    prospectsCancelled: sumField(conversionRows, "prospects_cancelled"),
    started: sumField(conversionRows, "started"),
    applicationsPartiallyCompleted: sumField(conversionRows, "applications_partially_completed"),
    completed: sumField(conversionRows, "completed"),
    completedCancelled: sumField(conversionRows, "completed_cancelled"),
    denied: sumField(conversionRows, "denied"),
    approved: sumField(conversionRows, "approved"),
    approvedCancelled: sumField(conversionRows, "approved_cancelled"),
    leaseCompleted: sumField(conversionRows, "lease_completed"),
    leaseCompletedCancelled: sumField(conversionRows, "lease_completed_cancelled"),
    abandoned: sumField(conversionRows, "abandoned"),
    leaseApproved: sumField(conversionRows, "lease_approved"),

    readyVacantRented: makeReadyMetric(input.reportData, "Ready", "vacant_rented"),
    readyVacantUnrented: makeReadyMetric(input.reportData, "Ready", "vacant_unrented"),
    readyTotal: makeReadyMetric(input.reportData, "Ready", "total"),
    notReadyVacantRented: makeReadyMetric(input.reportData, "Not Ready", "vacant_rented"),
    notReadyVacantUnrented: makeReadyMetric(input.reportData, "Not Ready", "vacant_unrented"),
    notReadyTotal: makeReadyMetric(input.reportData, "Not Ready", "total"),
    makeReadySummaryTotal: getDecimal(firstRow(input.reportData, "make_ready").summary_total)
  };
}

export async function transformBoxScoreReport(
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
  const context = await getStagingContext(prisma, input.stagingReportDataId, input.rawRequest);
  const reportData = asObject(input.rawRecordPayload);
  const summarizeBy = context.summarizeBy.trim().toLowerCase();

  const propertyName = findFirstPropertyName(reportData);

  if (!propertyName) {
    throw new Error("Box Score report payload is missing property/property_name.");
  }

  const responseLookupCode = getString(firstRow(reportData, "availability").lookup_code);

  const property = await resolvePropertyForBoxScore(prisma, {
    companyId: input.companyId,
    organisationId: input.organisationId,
    propertyName,
    ...(context.requestedPropertyCode ? { requestedPropertyCode: context.requestedPropertyCode } : {}),
    ...(responseLookupCode ? { responseLookupCode } : {}),
    ...(input.cachedProperties ? { cachedProperties: input.cachedProperties } : {})
  });

  if (summarizeBy === "unit_type") {
    /*
     * summarize_by = unit_type is supporting/detail data.
     * It must be stored only in property_box_score_unit_type_monthly.
     * Do NOT aggregate this response into property_box_score_monthly because
     * property_box_score_monthly is protected by a DB CHECK constraint and is
     * reserved for Entrata's own property-level summarize_by = property_name output.
     */
    const rowsByUnitType = mergeRowsByUnitType(reportData);

    for (const [unitType, rowSet] of rowsByUnitType) {
      const data = commonUnitTypeData({
        context,
        property,
        propertyName,
        unitType,
        rowSet,
        companyId: input.companyId,
        organisationId: input.organisationId
      });

      await prisma.propertyBoxScoreUnitTypeMonthly.upsert({
        where: {
          companyId_organisationId_propertyId_fiscalYear_reportMonth_unitType: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            propertyId: property.id,
            fiscalYear: data.fiscalYear,
            reportMonth: context.reportMonth,
            unitType
          }
        },
        update: data,
        create: data
      });
    }

    await prisma.stagingReportData.update({
      where: { id: input.stagingReportDataId },
      data: {
        validationStatus: "VALID",
        transformStatus: "TRANSFORMED",
        transformedAt: new Date()
      }
    });

    return;
  }

  if (summarizeBy === "property_name") {
    /*
     * summarize_by = property_name is the canonical property/month source used
     * by the occupancy projection. Only this branch writes to
     * property_box_score_monthly.
     */
    const monthlyData = aggregateMonthlyData({
      reportData,
      context,
      property,
      propertyName,
      companyId: input.companyId,
      organisationId: input.organisationId
    });

    await prisma.propertyBoxScoreMonthly.upsert({
      where: {
        companyId_organisationId_propertyId_fiscalYear_reportMonth_summarizeBy: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          propertyId: property.id,
          fiscalYear: monthlyData.fiscalYear,
          reportMonth: context.reportMonth,
          summarizeBy: "property_name"
        }
      },
      update: monthlyData,
      create: monthlyData
    });

    // Update move_ins and move_outs in occupancy_reforecast_details till reforecast_locked_till_month
    const reportMonthNum = context.reportMonth.getUTCMonth() + 1;
    if (
      property.reforecastLockedTillMonth &&
      reportMonthNum <= property.reforecastLockedTillMonth
    ) {
      const occupancyReforecast = await prisma.occupancyReforecast.findUnique({
        where: {
          propertyId_year: {
            propertyId: property.id,
            year: monthlyData.fiscalYear
          }
        },
        select: { id: true }
      });

      if (occupancyReforecast) {
        await prisma.occupancyReforecastDetail.updateMany({
          where: {
            reforecastId: occupancyReforecast.id,
            month: reportMonthNum
          },
          data: {
            moveIns: Math.round(Number(monthlyData.moveIns ?? 0)),
            moveOuts: Math.round(Number(monthlyData.moveOuts ?? 0)),
            endingOccUnits: Math.round(Number(monthlyData.occupiedUnits ?? 0))
          }
        });
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

    return;
  }

  throw new Error(
    `Unsupported Box Score summarize_by: ${context.summarizeBy}. ` +
    `Expected "property_name" or "unit_type".`
  );
}
