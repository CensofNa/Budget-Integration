import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";

export interface ProjectOccupancyFromReportsInput {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  propertyId: string;
  budgetYear: number;
}

const masterNames = {
  totalUnits: "Total Units",
  beginningOccPct: "Beginning Occ. - %",
  beginningOccUnitsInput: "Beginning Occ. - Units Input",
  beginningOccUnits: "Beginning Occ. - Units",
  moveIns: "Move-Ins",
  moveOuts: "Move-Outs",
  endingOccUnits: "Ending Occupancy - Units",
  endingOccPct: "Ending Occupancy - %",
  traffic: "Traffic",
  netClosingPct: "Net Closing %",
  totalMoveIns: "Total Move-Ins",
  pctTotalMoveIns: "% Total Move-Ins",
  leaseExpirations: "Lease Expirations",
  lyLeaseExpirations: "LY Lease Expirations",
  renewalPct: "Renewal %",
  nonRenewals: "Non-Renewals",
  skipsEvictionsOther: "Skips, Evictions, Other",
  totalMoveOuts: "Total Move-Outs",
  pctTotalMoveOuts: "% Total Move-Outs",
  turnoverBudgetYear: "Turnover % - Budget Year",
  turnoverPriorYear: "Turnover % - Prior Year",
  renewals: "Renewals",
  skipsEvictionsBudgetYear: "Skips, Evictions - Budget Year",
  skipsEvictionsPriorYear: "Skips, Evictions - Prior Year",
  trafficBudgetYear: "Traffic - Budget Year",
  trafficPriorYear: "Traffic - Prior Year",
  netClosingBudgetYear: "Net Closing % - Budget Year",
  netClosingPriorYear: "Net Closing % - Prior Year",
  leaseExpBudgetYear: "Lease Expirations - Budget Year",
  leaseExpPriorYear: "Lease Expirations - Prior Year",
  renewalPctBudgetYear: "Renewal % - Budget Year",
  renewalPctPriorYear: "Renewal % - Prior Year",
} as const;

type MonthKey =
  | "jan"
  | "feb"
  | "mar"
  | "apr"
  | "may"
  | "jun"
  | "jul"
  | "aug"
  | "sep"
  | "oct"
  | "nov"
  | "dec";

const monthKeys: MonthKey[] = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

type BoxRow = Awaited<
  ReturnType<typeof prisma.propertyBoxScoreMonthly.findMany>
>[number];
type RetentionRow = Awaited<
  ReturnType<typeof prisma.propertyResidentRetentionMonthly.findMany>
>[number];

type CombinedRow = {
  box?: BoxRow;
  retention?: RetentionRow;
};

function toNumber(
  value: Prisma.Decimal | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeDivPercent(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (numerator === null || denominator === null || denominator === 0)
    return null;
  return (numerator / denominator) * 100;
}

function sum(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return valid.reduce((total, value) => total + value, 0);
}

function avg(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

function lastNonNull(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index--) {
    const value = values[index];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function normalizePercentage(value: number | null): number | null {
  if (value === null) return null;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function monthStart(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1));
}

function previousMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getFiscalDateRange(
  budgetYear: number,
  startMonth: number,
): {
  currentStart: Date;
  currentEnd: Date;
  priorStart: Date;
  priorEnd: Date;
} {
  const m = startMonth >= 1 && startMonth <= 12 ? startMonth : 1;
  const currentStart = monthStart(budgetYear, m - 1);
  const currentEnd = monthStart(budgetYear + 1, m - 1);
  const priorStart = monthStart(budgetYear - 1, m - 1);
  const priorEnd = monthStart(budgetYear, m - 1);

  return { currentStart, currentEnd, priorStart, priorEnd };
}

function getFiscalSlotDate(
  budgetYear: number,
  startMonth: number,
  slotIndex: number,
): Date {
  const m = startMonth >= 1 && startMonth <= 12 ? startMonth : 1;
  const totalMonth = m - 1 + slotIndex;
  const yearOffset = Math.floor(totalMonth / 12);
  const calMonthIndex = totalMonth % 12;
  return monthStart(budgetYear + yearOffset, calMonthIndex);
}

function getTraffic(row: CombinedRow | undefined): number | null {
  return (
    toNumber(row?.box?.uniqueVisitsTours) ??
    toNumber(row?.box?.visitTour) ??
    toNumber(row?.box?.newLeads)
  );
}

async function ensureAllOccupancyDetailRows(input: {
  transactionId: string;
}): Promise<Map<string, string>> {
  const masters = await prisma.occupancyMaster.findMany({
    select: {
      id: true,
      descriptionName: true,
    },
    orderBy: {
      descriptionName: "asc",
    },
  });

  const masterIdByName = new Map<string, string>();
  for (const master of masters) {
    masterIdByName.set(master.descriptionName, master.id);
  }

  const existingDetails = await prisma.occupancyTransactionDetail.findMany({
    where: {
      occupancyTransactionId: input.transactionId,
    },
    select: {
      occupancyMasterId: true,
    },
  });

  const existingMasterIds = new Set(
    existingDetails
      .map((detail) => detail.occupancyMasterId)
      .filter((id): id is string => !!id),
  );

  const missingMasters = masters.filter(
    (master) => !existingMasterIds.has(master.id),
  );

  if (missingMasters.length > 0) {
    await prisma.occupancyTransactionDetail.createMany({
      data: missingMasters.map((master) => ({
        occupancyTransactionId: input.transactionId,
        occupancyMasterId: master.id,
        method: "manual",
        jan: null,
        feb: null,
        mar: null,
        apr: null,
        may: null,
        jun: null,
        jul: null,
        aug: null,
        sep: null,
        oct: null,
        nov: null,
        dec: null,
        fullYear: null,
      })),
      skipDuplicates: true,
    });
  }

  return masterIdByName;
}

async function upsertDetail(input: {
  transactionId: string;
  masterId: string;
  values: Record<MonthKey, number | null>;
  fullYearStrategy?: "sum" | "avg" | "last";
}): Promise<void> {
  const monthValues = monthKeys.map((key) => input.values[key]);
  let fullYear: number | null;

  switch (input.fullYearStrategy ?? "sum") {
    case "avg":
      fullYear = avg(monthValues);
      break;
    case "last":
      fullYear = lastNonNull(monthValues);
      break;
    case "sum":
    default:
      fullYear = sum(monthValues);
      break;
  }

  await prisma.occupancyTransactionDetail.upsert({
    where: {
      occupancyTransactionId_occupancyMasterId: {
        occupancyTransactionId: input.transactionId,
        occupancyMasterId: input.masterId,
      },
    },
    update: {
      method: "manual",
      jan: input.values.jan,
      feb: input.values.feb,
      mar: input.values.mar,
      apr: input.values.apr,
      may: input.values.may,
      jun: input.values.jun,
      jul: input.values.jul,
      aug: input.values.aug,
      sep: input.values.sep,
      oct: input.values.oct,
      nov: input.values.nov,
      dec: input.values.dec,
      fullYear,
    },
    create: {
      occupancyTransactionId: input.transactionId,
      occupancyMasterId: input.masterId,
      method: "manual",
      jan: input.values.jan,
      feb: input.values.feb,
      mar: input.values.mar,
      apr: input.values.apr,
      may: input.values.may,
      jun: input.values.jun,
      jul: input.values.jul,
      aug: input.values.aug,
      sep: input.values.sep,
      oct: input.values.oct,
      nov: input.values.nov,
      dec: input.values.dec,
      fullYear,
    },
  });
}

export async function projectOccupancyFromReportsJob(
  input: ProjectOccupancyFromReportsInput,
): Promise<{
  projectedRows: number;
  skippedRows: number;
  totalMasterRows: number;
}> {
  const transaction = await prisma.occupancyTransaction.upsert({
    where: {
      propertyId_budgetYear: {
        propertyId: input.propertyId,
        budgetYear: String(input.budgetYear),
      },
    },
    update: {
      updatedAt: new Date(),
    },
    create: {
      propertyId: input.propertyId,
      budgetYear: String(input.budgetYear),
    },
  });

  const property = await prisma.property.findUnique({
    where: { id: input.propertyId },
    select: {
      id: true,
      code: true,
      fiscalYearStartMonth: true,
      reforecastLockedTillMonth: true,
    },
  });

  const startMonth =
    property?.fiscalYearStartMonth &&
    property.fiscalYearStartMonth >= 1 &&
    property.fiscalYearStartMonth <= 12
      ? property.fiscalYearStartMonth
      : 1;

  const { currentStart, currentEnd, priorStart, priorEnd } = getFiscalDateRange(
    input.budgetYear,
    startMonth,
  );

  const [
    currentBoxRows,
    priorBoxRows,
    currentRetentionRows,
    priorRetentionRows,
  ] = await Promise.all([
    prisma.propertyBoxScoreMonthly.findMany({
      where: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        propertyId: input.propertyId,
        summarizeBy: "property_name",
        reportMonth: {
          gte: currentStart,
          lt: currentEnd,
        },
      },
      orderBy: { reportMonth: "asc" },
    }),
    prisma.propertyBoxScoreMonthly.findMany({
      where: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        propertyId: input.propertyId,
        summarizeBy: "property_name",
        reportMonth: {
          gte: priorStart,
          lt: priorEnd,
        },
      },
      orderBy: { reportMonth: "asc" },
    }),
    prisma.propertyResidentRetentionMonthly.findMany({
      where: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        propertyId: input.propertyId,
        reportMonth: {
          gte: currentStart,
          lt: currentEnd,
        },
      },
      orderBy: { reportMonth: "asc" },
    }),
    prisma.propertyResidentRetentionMonthly.findMany({
      where: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        propertyId: input.propertyId,
        reportMonth: {
          gte: priorStart,
          lt: priorEnd,
        },
      },
      orderBy: { reportMonth: "asc" },
    }),
  ]);

  // Sync move_ins and move_outs to occupancy_reforecast_details if within reforecastLockedTillMonth
  if (property?.reforecastLockedTillMonth) {
    const occupancyReforecast = await prisma.occupancyReforecast.findUnique({
      where: {
        propertyId_year: {
          propertyId: input.propertyId,
          year: input.budgetYear,
        },
      },
      select: { id: true },
    });

    if (occupancyReforecast) {
      for (let m = 1; m <= property.reforecastLockedTillMonth; m++) {
        const boxRow = currentBoxRows.find((r) => {
          const rMonth = new Date(r.reportMonth).getUTCMonth() + 1;
          return rMonth === m;
        });
        const retentionRow = currentRetentionRows.find((r) => {
          const rMonth = new Date(r.reportMonth).getUTCMonth() + 1;
          return rMonth === m;
        });

        const updateData: {
          moveIns?: number;
          moveOuts?: number;
          endingOccUnits?: number;
          leaseExpirations?: number;
          renewalPercent?: number;
        } = {};

        if (boxRow) {
          if (boxRow.moveIns !== null && boxRow.moveIns !== undefined) {
            updateData.moveIns = Math.round(Number(boxRow.moveIns));
          }
          if (boxRow.moveOuts !== null && boxRow.moveOuts !== undefined) {
            updateData.moveOuts = Math.round(Number(boxRow.moveOuts));
          }
          if (boxRow.occupiedUnits !== null && boxRow.occupiedUnits !== undefined) {
            updateData.endingOccUnits = Math.round(Number(boxRow.occupiedUnits));
          }
        }

        if (retentionRow) {
          if (retentionRow.expiringLeases !== null && retentionRow.expiringLeases !== undefined) {
            updateData.leaseExpirations = Math.round(Number(retentionRow.expiringLeases));
          }
          if (retentionRow.renewalPercentage !== null && retentionRow.renewalPercentage !== undefined) {
            updateData.renewalPercent = Number(retentionRow.renewalPercentage);
          }
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.occupancyReforecastDetail.updateMany({
            where: {
              reforecastId: occupancyReforecast.id,
              month: m,
            },
            data: updateData,
          });
        }
      }
    }
  }

  const byMonth = new Map<string, CombinedRow>();
  const priorByMonth = new Map<string, CombinedRow>();

  for (const row of currentBoxRows) {
    const key = monthKey(row.reportMonth);
    byMonth.set(key, { ...(byMonth.get(key) ?? {}), box: row });
  }

  for (const row of currentRetentionRows) {
    const key = monthKey(row.reportMonth);
    byMonth.set(key, { ...(byMonth.get(key) ?? {}), retention: row });
  }

  for (const row of priorBoxRows) {
    const key = monthKey(row.reportMonth);
    priorByMonth.set(key, { ...(priorByMonth.get(key) ?? {}), box: row });
  }

  for (const row of priorRetentionRows) {
    const key = monthKey(row.reportMonth);
    priorByMonth.set(key, { ...(priorByMonth.get(key) ?? {}), retention: row });
  }

  function rowForSlot(slotIndex: number): CombinedRow | undefined {
    const d = getFiscalSlotDate(input.budgetYear, startMonth, slotIndex);
    return byMonth.get(monthKey(d));
  }

  function priorYearRowForSlot(slotIndex: number): CombinedRow | undefined {
    const d = getFiscalSlotDate(input.budgetYear - 1, startMonth, slotIndex);
    return priorByMonth.get(monthKey(d));
  }

  function previousRowForSlot(slotIndex: number): CombinedRow | undefined {
    const d = getFiscalSlotDate(input.budgetYear, startMonth, slotIndex);
    const prev = previousMonth(d);
    const key = monthKey(prev);
    return byMonth.get(key) ?? priorByMonth.get(key);
  }

  function valuesFor(
    calculator: (
      row: CombinedRow | undefined,
      slotIndex: number,
    ) => number | null,
  ): Record<MonthKey, number | null> {
    return monthKeys.reduce<Record<MonthKey, number | null>>(
      (result, key, index) => {
        result[key] = calculator(rowForSlot(index), index);
        return result;
      },
      {} as Record<MonthKey, number | null>,
    );
  }

  const mappings: Array<{
    name: string;
    values: Record<MonthKey, number | null>;
    fullYearStrategy?: "sum" | "avg" | "last";
  }> = [
    {
      name: masterNames.totalUnits,
      values: valuesFor((row) => toNumber(row?.box?.totalRentableUnits)),
      fullYearStrategy: "avg",
    },
    {
      name: masterNames.beginningOccPct,
      values: valuesFor((_row, slotIndex) => {
        const previous = previousRowForSlot(slotIndex);
        return safeDivPercent(
          toNumber(previous?.box?.occupiedUnits),
          toNumber(previous?.box?.totalRentableUnits),
        );
      }),
      fullYearStrategy: "avg",
    },
    {
      name: masterNames.beginningOccUnitsInput,
      values: valuesFor((_row, slotIndex) =>
        toNumber(previousRowForSlot(slotIndex)?.box?.occupiedUnits),
      ),
      fullYearStrategy: "avg",
    },
    {
      name: masterNames.beginningOccUnits,
      values: valuesFor((_row, slotIndex) =>
        toNumber(previousRowForSlot(slotIndex)?.box?.occupiedUnits),
      ),
      fullYearStrategy: "avg",
    },
    {
      name: masterNames.moveIns,
      values: valuesFor((row) => toNumber(row?.box?.moveIns)),
    },
    {
      name: masterNames.moveOuts,
      values: valuesFor((row) => toNumber(row?.box?.moveOuts)),
    },
    {
      name: masterNames.endingOccUnits,
      values: valuesFor((row) => toNumber(row?.box?.occupiedUnits)),
      fullYearStrategy: "avg",
    },
    {
      name: masterNames.endingOccPct,
      values: valuesFor((row) =>
        safeDivPercent(
          toNumber(row?.box?.occupiedUnits),
          toNumber(row?.box?.totalRentableUnits),
        ),
      ),
      fullYearStrategy: "avg",
    },
    { name: masterNames.traffic, values: valuesFor((row) => getTraffic(row)) },
    {
      name: masterNames.netClosingPct,
      values: valuesFor((row) =>
        safeDivPercent(toNumber(row?.box?.leaseCompleted), getTraffic(row)),
      ),
      fullYearStrategy: "avg",
    },
    {
      name: masterNames.totalMoveIns,
      values: valuesFor((row) => toNumber(row?.box?.moveIns)),
    },
    {
      name: masterNames.pctTotalMoveIns,
      values: valuesFor((row) =>
        safeDivPercent(
          toNumber(row?.box?.moveIns),
          toNumber(row?.box?.totalRentableUnits),
        ),
      ),
      fullYearStrategy: "avg",
    },
    {
      name: masterNames.leaseExpirations,
      values: valuesFor((row) => toNumber(row?.retention?.expiringLeases)),
    },
    {
      name: masterNames.lyLeaseExpirations,
      values: valuesFor((_row, slotIndex) =>
        toNumber(priorYearRowForSlot(slotIndex)?.retention?.expiringLeases),
      ),
    },
    {
      name: masterNames.renewalPct,
      values: valuesFor((row) =>
        normalizePercentage(toNumber(row?.retention?.renewalPercentage)),
      ),
      fullYearStrategy: "avg",
    },
    {
      name: masterNames.nonRenewals,
      values: valuesFor((row) => toNumber(row?.retention?.ntv)),
    },
    {
      name: masterNames.skipsEvictionsOther,
      values: valuesFor((row) =>
        sum([
          toNumber(row?.box?.skips),
          toNumber(row?.box?.evictionsCompleted),
        ]),
      ),
    },
    {
      name: masterNames.totalMoveOuts,
      values: valuesFor((row) => toNumber(row?.box?.moveOuts)),
    },
    {
      name: masterNames.pctTotalMoveOuts,
      values: valuesFor((row) =>
        safeDivPercent(
          toNumber(row?.box?.moveOuts),
          toNumber(row?.box?.totalRentableUnits),
        ),
      ),
      fullYearStrategy: "avg",
    },
    {
      name: masterNames.turnoverBudgetYear,
      values: valuesFor((_row, slotIndex) => {
        const rows = monthKeys
          .slice(0, slotIndex + 1)
          .map((_key, index) => rowForSlot(index));
        return safeDivPercent(
          sum(rows.map((row) => toNumber(row?.box?.moveOuts))),
          avg(rows.map((row) => toNumber(row?.box?.totalRentableUnits))),
        );
      }),
      fullYearStrategy: "last",
    },
    {
      name: masterNames.turnoverPriorYear,
      values: valuesFor((_row, slotIndex) => {
        const rows = monthKeys
          .slice(0, slotIndex + 1)
          .map((_key, index) => priorYearRowForSlot(index));
        return safeDivPercent(
          sum(rows.map((row) => toNumber(row?.box?.moveOuts))),
          avg(rows.map((row) => toNumber(row?.box?.totalRentableUnits))),
        );
      }),
      fullYearStrategy: "last",
    },
    {
      name: masterNames.renewals,
      values: valuesFor((row) => toNumber(row?.retention?.renewals)),
    },
    {
      name: masterNames.skipsEvictionsBudgetYear,
      values: valuesFor((row) =>
        sum([
          toNumber(row?.box?.skips),
          toNumber(row?.box?.evictionsCompleted),
        ]),
      ),
    },
    {
      name: masterNames.skipsEvictionsPriorYear,
      values: valuesFor((_row, slotIndex) => {
        const prior = priorYearRowForSlot(slotIndex);
        return sum([
          toNumber(prior?.box?.skips),
          toNumber(prior?.box?.evictionsCompleted),
        ]);
      }),
    },
    {
      name: masterNames.trafficBudgetYear,
      values: valuesFor((row) => getTraffic(row)),
    },
    {
      name: masterNames.trafficPriorYear,
      values: valuesFor((_row, slotIndex) =>
        getTraffic(priorYearRowForSlot(slotIndex)),
      ),
    },
    {
      name: masterNames.netClosingBudgetYear,
      values: valuesFor((row) =>
        safeDivPercent(toNumber(row?.box?.leaseCompleted), getTraffic(row)),
      ),
      fullYearStrategy: "avg",
    },
    {
      name: masterNames.netClosingPriorYear,
      values: valuesFor((_row, slotIndex) => {
        const prior = priorYearRowForSlot(slotIndex);
        return safeDivPercent(
          toNumber(prior?.box?.leaseCompleted),
          getTraffic(prior),
        );
      }),
      fullYearStrategy: "avg",
    },
    {
      name: masterNames.leaseExpBudgetYear,
      values: valuesFor((row) => toNumber(row?.retention?.expiringLeases)),
    },
    {
      name: masterNames.leaseExpPriorYear,
      values: valuesFor((_row, slotIndex) =>
        toNumber(priorYearRowForSlot(slotIndex)?.retention?.expiringLeases),
      ),
    },
    {
      name: masterNames.renewalPctBudgetYear,
      values: valuesFor((row) =>
        normalizePercentage(toNumber(row?.retention?.renewalPercentage)),
      ),
      fullYearStrategy: "avg",
    },
    {
      name: masterNames.renewalPctPriorYear,
      values: valuesFor((_row, slotIndex) =>
        normalizePercentage(
          toNumber(priorYearRowForSlot(slotIndex)?.retention?.renewalPercentage),
        ),
      ),
      fullYearStrategy: "avg",
    },
  ];

  const masterIdByName = await ensureAllOccupancyDetailRows({
    transactionId: transaction.id,
  });

  let projectedRows = 0;
  let skippedRows = 0;

  for (const mapping of mappings) {
    const masterId = masterIdByName.get(mapping.name);

    if (!masterId) {
      skippedRows++;
      console.warn(
        `Skipping occupancy projection. occupancy_master.description_name not found: ${mapping.name}`,
      );
      continue;
    }

    await upsertDetail({
      transactionId: transaction.id,
      masterId,
      values: mapping.values,
      ...(mapping.fullYearStrategy
        ? { fullYearStrategy: mapping.fullYearStrategy }
        : {}),
    });

    projectedRows++;
  }

  return {
    projectedRows,
    skippedRows,
    totalMasterRows: masterIdByName.size,
  };
}
