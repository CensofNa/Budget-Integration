import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
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
};
const monthKeys = [
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
function toNumber(value) {
    if (value === null || value === undefined)
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function safeDivPercent(numerator, denominator) {
    if (numerator === null || denominator === null || denominator === 0)
        return null;
    return (numerator / denominator) * 100;
}
function sum(values) {
    const valid = values.filter((value) => value !== null);
    if (valid.length === 0)
        return null;
    return valid.reduce((total, value) => total + value, 0);
}
function avg(values) {
    const valid = values.filter((value) => value !== null);
    if (valid.length === 0)
        return null;
    return valid.reduce((total, value) => total + value, 0) / valid.length;
}
function lastNonNull(values) {
    for (let index = values.length - 1; index >= 0; index--) {
        const value = values[index];
        if (value !== null && value !== undefined)
            return value;
    }
    return null;
}
function normalizePercentage(value) {
    if (value === null)
        return null;
    return Math.abs(value) <= 1 ? value * 100 : value;
}
function monthStart(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex, 1));
}
function previousMonth(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}
function monthKey(date) {
    return date.toISOString().slice(0, 10);
}
function getFiscalDateRange(budgetYear, startMonth) {
    const m = startMonth >= 1 && startMonth <= 12 ? startMonth : 1;
    const currentStart = monthStart(budgetYear, m - 1);
    const currentEnd = monthStart(budgetYear + 1, m - 1);
    const priorStart = monthStart(budgetYear - 1, m - 1);
    const priorEnd = monthStart(budgetYear, m - 1);
    return { currentStart, currentEnd, priorStart, priorEnd };
}
function getFiscalSlotDate(budgetYear, startMonth, slotIndex) {
    const m = startMonth >= 1 && startMonth <= 12 ? startMonth : 1;
    const totalMonth = m - 1 + slotIndex;
    const yearOffset = Math.floor(totalMonth / 12);
    const calMonthIndex = totalMonth % 12;
    return monthStart(budgetYear + yearOffset, calMonthIndex);
}
function getTraffic(row) {
    return (toNumber(row?.box?.uniqueVisitsTours) ??
        toNumber(row?.box?.visitTour) ??
        toNumber(row?.box?.newLeads));
}
async function ensureAllOccupancyDetailRows(input) {
    const masters = await prisma.occupancyMaster.findMany({
        select: {
            id: true,
            descriptionName: true,
        },
        orderBy: {
            descriptionName: "asc",
        },
    });
    const masterIdByName = new Map();
    for (const master of masters) {
        masterIdByName.set(master.descriptionName, master.id);
        // Insert every occupancy_master row for the UI grid.
        // Method is always manual as requested. Report projection only fills month values.
        await prisma.occupancyTransactionDetail.upsert({
            where: {
                occupancyTransactionId_occupancyMasterId: {
                    occupancyTransactionId: input.transactionId,
                    occupancyMasterId: master.id,
                },
            },
            update: {
                method: "manual",
            },
            create: {
                occupancy_transaction_id: input.transactionId,
                occupancy_master_id: master.id,
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
                full_year: null,
            },
        });
    }
    return masterIdByName;
}
async function upsertDetail(input) {
    const monthValues = monthKeys.map((key) => input.values[key]);
    let fullYear;
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
            full_year: fullYear,
        },
        create: {
            occupancy_transaction_id: input.transactionId,
            occupancy_master_id: input.masterId,
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
            full_year: fullYear,
        },
    });
}
export async function projectOccupancyFromReportsJob(input) {
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
        },
    });
    const startMonth = property?.fiscalYearStartMonth &&
        property.fiscalYearStartMonth >= 1 &&
        property.fiscalYearStartMonth <= 12
        ? property.fiscalYearStartMonth
        : 1;
    const { currentStart, currentEnd, priorStart, priorEnd } = getFiscalDateRange(input.budgetYear, startMonth);
    const [currentBoxRows, priorBoxRows, currentRetentionRows, priorRetentionRows,] = await Promise.all([
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
    const byMonth = new Map();
    const priorByMonth = new Map();
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
    function rowForSlot(slotIndex) {
        const d = getFiscalSlotDate(input.budgetYear, startMonth, slotIndex);
        return byMonth.get(monthKey(d));
    }
    function priorYearRowForSlot(slotIndex) {
        const d = getFiscalSlotDate(input.budgetYear - 1, startMonth, slotIndex);
        return priorByMonth.get(monthKey(d));
    }
    function previousRowForSlot(slotIndex) {
        const d = getFiscalSlotDate(input.budgetYear, startMonth, slotIndex);
        const prev = previousMonth(d);
        const key = monthKey(prev);
        return byMonth.get(key) ?? priorByMonth.get(key);
    }
    function valuesFor(calculator) {
        return monthKeys.reduce((result, key, index) => {
            result[key] = calculator(rowForSlot(index), index);
            return result;
        }, {});
    }
    const mappings = [
        {
            name: masterNames.totalUnits,
            values: valuesFor((row) => toNumber(row?.box?.totalRentableUnits)),
            fullYearStrategy: "avg",
        },
        {
            name: masterNames.beginningOccPct,
            values: valuesFor((_row, slotIndex) => {
                const previous = previousRowForSlot(slotIndex);
                return safeDivPercent(toNumber(previous?.box?.occupiedUnits), toNumber(previous?.box?.totalRentableUnits));
            }),
            fullYearStrategy: "avg",
        },
        {
            name: masterNames.beginningOccUnitsInput,
            values: valuesFor((_row, slotIndex) => toNumber(previousRowForSlot(slotIndex)?.box?.occupiedUnits)),
            fullYearStrategy: "avg",
        },
        {
            name: masterNames.beginningOccUnits,
            values: valuesFor((_row, slotIndex) => toNumber(previousRowForSlot(slotIndex)?.box?.occupiedUnits)),
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
            values: valuesFor((row) => safeDivPercent(toNumber(row?.box?.occupiedUnits), toNumber(row?.box?.totalRentableUnits))),
            fullYearStrategy: "avg",
        },
        { name: masterNames.traffic, values: valuesFor((row) => getTraffic(row)) },
        {
            name: masterNames.netClosingPct,
            values: valuesFor((row) => safeDivPercent(toNumber(row?.box?.leaseCompleted), getTraffic(row))),
            fullYearStrategy: "avg",
        },
        {
            name: masterNames.totalMoveIns,
            values: valuesFor((row) => toNumber(row?.box?.moveIns)),
        },
        {
            name: masterNames.pctTotalMoveIns,
            values: valuesFor((row) => safeDivPercent(toNumber(row?.box?.moveIns), toNumber(row?.box?.totalRentableUnits))),
            fullYearStrategy: "avg",
        },
        {
            name: masterNames.leaseExpirations,
            values: valuesFor((row) => toNumber(row?.retention?.expiringLeases)),
        },
        {
            name: masterNames.lyLeaseExpirations,
            values: valuesFor((_row, slotIndex) => toNumber(priorYearRowForSlot(slotIndex)?.retention?.expiringLeases)),
        },
        {
            name: masterNames.renewalPct,
            values: valuesFor((row) => normalizePercentage(toNumber(row?.retention?.renewalPercentage))),
            fullYearStrategy: "avg",
        },
        {
            name: masterNames.nonRenewals,
            values: valuesFor((row) => toNumber(row?.retention?.ntv)),
        },
        {
            name: masterNames.skipsEvictionsOther,
            values: valuesFor((row) => sum([
                toNumber(row?.box?.skips),
                toNumber(row?.box?.evictionsCompleted),
            ])),
        },
        {
            name: masterNames.totalMoveOuts,
            values: valuesFor((row) => toNumber(row?.box?.moveOuts)),
        },
        {
            name: masterNames.pctTotalMoveOuts,
            values: valuesFor((row) => safeDivPercent(toNumber(row?.box?.moveOuts), toNumber(row?.box?.totalRentableUnits))),
            fullYearStrategy: "avg",
        },
        {
            name: masterNames.turnoverBudgetYear,
            values: valuesFor((_row, slotIndex) => {
                const rows = monthKeys
                    .slice(0, slotIndex + 1)
                    .map((_key, index) => rowForSlot(index));
                return safeDivPercent(sum(rows.map((row) => toNumber(row?.box?.moveOuts))), avg(rows.map((row) => toNumber(row?.box?.totalRentableUnits))));
            }),
            fullYearStrategy: "last",
        },
        {
            name: masterNames.turnoverPriorYear,
            values: valuesFor((_row, slotIndex) => {
                const rows = monthKeys
                    .slice(0, slotIndex + 1)
                    .map((_key, index) => priorYearRowForSlot(index));
                return safeDivPercent(sum(rows.map((row) => toNumber(row?.box?.moveOuts))), avg(rows.map((row) => toNumber(row?.box?.totalRentableUnits))));
            }),
            fullYearStrategy: "last",
        },
        {
            name: masterNames.renewals,
            values: valuesFor((row) => toNumber(row?.retention?.renewals)),
        },
        {
            name: masterNames.skipsEvictionsBudgetYear,
            values: valuesFor((row) => sum([
                toNumber(row?.box?.skips),
                toNumber(row?.box?.evictionsCompleted),
            ])),
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
            values: valuesFor((_row, slotIndex) => getTraffic(priorYearRowForSlot(slotIndex))),
        },
        {
            name: masterNames.netClosingBudgetYear,
            values: valuesFor((row) => safeDivPercent(toNumber(row?.box?.leaseCompleted), getTraffic(row))),
            fullYearStrategy: "avg",
        },
        {
            name: masterNames.netClosingPriorYear,
            values: valuesFor((_row, slotIndex) => {
                const prior = priorYearRowForSlot(slotIndex);
                return safeDivPercent(toNumber(prior?.box?.leaseCompleted), getTraffic(prior));
            }),
            fullYearStrategy: "avg",
        },
        {
            name: masterNames.leaseExpBudgetYear,
            values: valuesFor((row) => toNumber(row?.retention?.expiringLeases)),
        },
        {
            name: masterNames.leaseExpPriorYear,
            values: valuesFor((_row, slotIndex) => toNumber(priorYearRowForSlot(slotIndex)?.retention?.expiringLeases)),
        },
        {
            name: masterNames.renewalPctBudgetYear,
            values: valuesFor((row) => normalizePercentage(toNumber(row?.retention?.renewalPercentage))),
            fullYearStrategy: "avg",
        },
        {
            name: masterNames.renewalPctPriorYear,
            values: valuesFor((_row, slotIndex) => normalizePercentage(toNumber(priorYearRowForSlot(slotIndex)?.retention?.renewalPercentage))),
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
            console.warn(`Skipping occupancy projection. occupancy_master.description_name not found: ${mapping.name}`);
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
//# sourceMappingURL=project-occupancy-from-reports.job.js.map