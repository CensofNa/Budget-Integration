import { Prisma, PrismaClient } from "@prisma/client";

import { ensureActualsSnapshot } from "./budget-snapshot-helper.js";

export interface ProjectBudgetActualSnapshotsInput {
    companyId: string;
    organisationId: string;
    integrationSourceId?: string;
    syncRunId?: string | null;
    propertyId?: string | null;
    fiscalYear?: number | null;
}

export interface ProjectBudgetActualSnapshotsResult {
    processedActualGroups: number;

    createdActualSnapshots: number;
    existingActualSnapshots: number;

    upsertedActualCalcLines: number;

    refreshedWorkingBudgetBaselineLines: number;
    skippedBaselineRefreshBecauseWorkingBudgetMissing: number;

    skippedActualsWithoutFiscalYear: number;
}

interface ActualBudgetLineAmountSet {
    janAmount: Prisma.Decimal;
    febAmount: Prisma.Decimal;
    marAmount: Prisma.Decimal;
    aprAmount: Prisma.Decimal;
    mayAmount: Prisma.Decimal;
    junAmount: Prisma.Decimal;
    julAmount: Prisma.Decimal;
    augAmount: Prisma.Decimal;
    sepAmount: Prisma.Decimal;
    octAmount: Prisma.Decimal;
    novAmount: Prisma.Decimal;
    decAmount: Prisma.Decimal;
    fullYearAmount: Prisma.Decimal;
}

interface ImportedActualLine {
    accountCode: string;
    accountName: string | null;
    accountGroup: string | null;
    lineCode: string;
    lineName: string;
    sortOrder: number;
    amounts: ActualBudgetLineAmountSet;
}

/**
 * Projects imported Entrata actuals into final budget planning tables.
 *
 * Source tables:
 * - property_budget_actuals
 * - property_budget_gl_accounts
 *
 * Target tables:
 * - budget_snapshots
 * - budget_calc_lines
 * - budget_calc_line_baselines
 *
 * Important:
 * - ACTUALS snapshot is created if missing.
 * - ACTUALS budget_calc_lines are refreshed every sync.
 * - WORKING_BUDGET is not created here.
 * - WORKING_BUDGET baseline is refreshed only if WORKING_BUDGET already exists.
 * - budget_line_details are not touched here.
 * - budget_line_detail_baselines are not touched here.
 */
export async function projectBudgetActualSnapshotsFromImportedActuals(
    prisma: PrismaClient,
    input: ProjectBudgetActualSnapshotsInput
): Promise<ProjectBudgetActualSnapshotsResult> {
    validateProjectBudgetActualSnapshotsInput(input);

    const result: ProjectBudgetActualSnapshotsResult = {
        processedActualGroups: 0,

        createdActualSnapshots: 0,
        existingActualSnapshots: 0,

        upsertedActualCalcLines: 0,

        refreshedWorkingBudgetBaselineLines: 0,
        skippedBaselineRefreshBecauseWorkingBudgetMissing: 0,

        skippedActualsWithoutFiscalYear: 0
    };

    const actualGroups = await getActualProjectionGroups(prisma, input);

    for (const actualGroup of actualGroups) {
        if (!actualGroup.fiscalYear) {
            result.skippedActualsWithoutFiscalYear++;
            continue;
        }

        await prisma.$transaction(async (tx) => {
            const context = {
                companyId: actualGroup.companyId,
                organisationId: actualGroup.organisationId,
                propertyId: actualGroup.propertyId,
                fiscalYear: actualGroup.fiscalYear || new Date().getFullYear(),
                sourceSystem: "ENTRATA"
            };

            const actualsSnapshot = await ensureActualsSnapshot(tx, context);

            if (actualsSnapshot.wasCreated) {
                result.createdActualSnapshots++;
            } else {
                result.existingActualSnapshots++;
            }

            const actualLines = await buildImportedActualLines(tx, {
                companyId: actualGroup.companyId,
                organisationId: actualGroup.organisationId,
                propertyId: actualGroup.propertyId,
                fiscalYear: actualGroup.fiscalYear || 2026
            });

            const upsertedActualLines = await upsertActualsCalcLines(tx, {
                snapshotId: actualsSnapshot.snapshotId,
                companyId: actualGroup.companyId,
                organisationId: actualGroup.organisationId,
                propertyId: actualGroup.propertyId,
                fiscalYear: actualGroup.fiscalYear || 2026,
                lines: actualLines
            });

            result.upsertedActualCalcLines += upsertedActualLines;

            const workingBudgetSnapshot = await tx.budgetSnapshot.findUnique({
                where: {
                    propertyId_fiscalYear_snapshotType: {
                        propertyId: actualGroup.propertyId,
                        fiscalYear: actualGroup.fiscalYear || 2026,
                        snapshotType: "WORKING_BUDGET"
                    }
                },
                select: {
                    snapshotId: true
                }
            });

            /**
             * Important:
             * Do not create WORKING_BUDGET from actuals projection.
             *
             * WORKING_BUDGET should be created by budget projection only,
             * because only budget projection can populate initial working budget lines.
             */
            if (!workingBudgetSnapshot) {
                result.skippedBaselineRefreshBecauseWorkingBudgetMissing++;
            } else {
                const refreshedBaselineLines = await upsertWorkingBudgetActualBaselines(
                    tx,
                    {
                        workingBudgetSnapshotId: workingBudgetSnapshot.snapshotId,
                        actualsSnapshotId: actualsSnapshot.snapshotId,
                        companyId: actualGroup.companyId,
                        organisationId: actualGroup.organisationId,
                        propertyId: actualGroup.propertyId,
                        fiscalYear: actualGroup.fiscalYear || 2026,
                        lines: actualLines
                    }
                );

                result.refreshedWorkingBudgetBaselineLines += refreshedBaselineLines;
            }

            result.processedActualGroups++;
        });
    }

    return result;
}

function validateProjectBudgetActualSnapshotsInput(
    input: ProjectBudgetActualSnapshotsInput
): void {
    if (!input.companyId) {
        throw new Error("companyId is required for budget actual snapshot projection.");
    }

    if (!input.organisationId) {
        throw new Error(
            "organisationId is required for budget actual snapshot projection."
        );
    }
}

async function getActualProjectionGroups(
    prisma: PrismaClient,
    input: ProjectBudgetActualSnapshotsInput
): Promise<
    Array<{
        companyId: string;
        organisationId: string;
        propertyId: string;
        fiscalYear: number | null;
    }>
> {
    const actuals = await prisma.propertyBudgetActual.findMany({
        where: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            ...(input.propertyId
                ? {
                    propertyId: input.propertyId
                }
                : {}),
            ...(input.fiscalYear
                ? {
                    fiscalYear: input.fiscalYear
                }
                : {})
        },
        select: {
            companyId: true,
            organisationId: true,
            propertyId: true,
            fiscalYear: true
        },
        distinct: ["companyId", "organisationId", "propertyId", "fiscalYear"],
        orderBy: [
            {
                propertyId: "asc"
            },
            {
                fiscalYear: "asc"
            }
        ]
    });

    return actuals;
}

async function buildImportedActualLines(
    tx: Prisma.TransactionClient,
    input: {
        companyId: string;
        organisationId: string;
        propertyId: string;
        fiscalYear: number;
    }
): Promise<ImportedActualLine[]> {
    const actualRows = await tx.propertyBudgetActual.findMany({
        where: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            propertyId: input.propertyId,
            fiscalYear: input.fiscalYear
        },
        include: {
            budgetGlAccount: true
        },
        orderBy: [
            {
                budgetGlAccountId: "asc"
            },
            {
                postMonth: "asc"
            }
        ]
    });

    const groupedActuals = new Map<
        string,
        Array<(typeof actualRows)[number]>
    >();

    for (const actualRow of actualRows) {
        const accountCode =
            actualRow.budgetGlAccount?.accountNumber ??
            actualRow.budgetGlAccount?.sourceGlAccountId ??
            actualRow.budgetGlAccountId;

        const existingRows = groupedActuals.get(accountCode) ?? [];
        existingRows.push(actualRow);
        groupedActuals.set(accountCode, existingRows);
    }

    const importedLines: ImportedActualLine[] = [];

    let sortOrder = 1;

    for (const [accountCode, rows] of groupedActuals.entries()) {
        const firstRow = rows[0];

        if (!firstRow) {
            continue;
        }

        const accountName = firstRow.budgetGlAccount?.accountName ?? null;
        const lineName = accountName ?? accountCode;

        const amounts = buildActualBudgetLineAmountSet(rows);

        importedLines.push({
            accountCode,
            accountName,
            accountGroup: null,
            lineCode: accountCode,
            lineName,
            sortOrder,
            amounts
        });

        sortOrder++;
    }

    return importedLines;
}

function buildActualBudgetLineAmountSet(
    actualRows: Array<{
        postMonth: Date | number | null;
        mtdActual: Prisma.Decimal | null;
    }>
): ActualBudgetLineAmountSet {
    const zero = decimalZero();

    const monthValues = new Map<number, Prisma.Decimal>();

    for (let monthNo = 1; monthNo <= 12; monthNo++) {
        monthValues.set(monthNo, zero);
    }

    for (const actualRow of actualRows) {
        const monthNo = getMonthNoFromPostMonth(actualRow.postMonth);

        if (!monthNo || monthNo < 1 || monthNo > 12) {
            continue;
        }

        const existingAmount = monthValues.get(monthNo) ?? zero;
        const actualAmount = actualRow.mtdActual ?? zero;

        monthValues.set(monthNo, existingAmount.plus(actualAmount));
    }

    const fullYearAmount = Array.from(monthValues.values()).reduce(
        (total, amount) => total.plus(amount),
        zero
    );

    return {
        janAmount: monthValues.get(1) ?? zero,
        febAmount: monthValues.get(2) ?? zero,
        marAmount: monthValues.get(3) ?? zero,
        aprAmount: monthValues.get(4) ?? zero,
        mayAmount: monthValues.get(5) ?? zero,
        junAmount: monthValues.get(6) ?? zero,
        julAmount: monthValues.get(7) ?? zero,
        augAmount: monthValues.get(8) ?? zero,
        sepAmount: monthValues.get(9) ?? zero,
        octAmount: monthValues.get(10) ?? zero,
        novAmount: monthValues.get(11) ?? zero,
        decAmount: monthValues.get(12) ?? zero,
        fullYearAmount
    };
}

// function getMonthNoFromPostMonth(postMonth: Date | number | null): number | null {
//     if (!postMonth) {
//         return null;
//     }

//     if (typeof postMonth === "number") {
//         return postMonth;
//     }

//     return postMonth.getMonth() + 1;
// }

function getMonthNoFromPostMonth(postMonth: Date | number | null): number | null {
  if (!postMonth) {
    return null;
  }

  if (typeof postMonth === "number") {
    return postMonth;
  }

  return postMonth.getUTCMonth() + 1;
}

interface UpsertActualsCalcLinesInput {
    snapshotId: string;
    companyId: string;
    organisationId: string;
    propertyId: string;
    fiscalYear: number;
    lines: ImportedActualLine[];
}

async function upsertActualsCalcLines(
    tx: Prisma.TransactionClient,
    input: UpsertActualsCalcLinesInput
): Promise<number> {
    let upsertedCount = 0;

    for (const line of input.lines) {
        await tx.budgetCalcLine.upsert({
            where: {
                snapshotId_lineCode: {
                    snapshotId: input.snapshotId,
                    lineCode: line.lineCode
                }
            },
            update: {
                accountCode: line.accountCode,
                accountName: line.accountName,
                accountGroup: line.accountGroup,
                lineName: line.lineName,
                lineType: "ACCOUNT",
                parentLineCode: null,
                sortOrder: line.sortOrder,

                isEditable: false,
                isCalculated: false,
                isReference: true,
                formulaJson: Prisma.JsonNull,

                janAmount: line.amounts.janAmount,
                febAmount: line.amounts.febAmount,
                marAmount: line.amounts.marAmount,
                aprAmount: line.amounts.aprAmount,
                mayAmount: line.amounts.mayAmount,
                junAmount: line.amounts.junAmount,
                julAmount: line.amounts.julAmount,
                augAmount: line.amounts.augAmount,
                sepAmount: line.amounts.sepAmount,
                octAmount: line.amounts.octAmount,
                novAmount: line.amounts.novAmount,
                decAmount: line.amounts.decAmount,
                fullYearAmount: line.amounts.fullYearAmount,

                notes: "Imported from Entrata actuals",
                updatedAt: new Date()
            },
            create: {
                snapshotId: input.snapshotId,
                companyId: input.companyId,
                organisationId: input.organisationId,
                propertyId: input.propertyId,
                fiscalYear: input.fiscalYear,
                snapshotType: "ACTUALS",

                coaId: null,
                accountCode: line.accountCode,
                accountName: line.accountName,
                accountGroup: line.accountGroup,

                lineCode: line.lineCode,
                lineName: line.lineName,
                lineType: "ACCOUNT",
                parentLineCode: null,
                sortOrder: line.sortOrder,

                isEditable: false,
                isCalculated: false,
                isReference: true,
                formulaJson: Prisma.JsonNull,

                janAmount: line.amounts.janAmount,
                febAmount: line.amounts.febAmount,
                marAmount: line.amounts.marAmount,
                aprAmount: line.amounts.aprAmount,
                mayAmount: line.amounts.mayAmount,
                junAmount: line.amounts.junAmount,
                julAmount: line.amounts.julAmount,
                augAmount: line.amounts.augAmount,
                sepAmount: line.amounts.sepAmount,
                octAmount: line.amounts.octAmount,
                novAmount: line.amounts.novAmount,
                decAmount: line.amounts.decAmount,
                fullYearAmount: line.amounts.fullYearAmount,

                notes: "Imported from Entrata actuals"
            }
        });

        upsertedCount++;
    }

    return upsertedCount;
}

interface UpsertWorkingBudgetActualBaselinesInput {
    workingBudgetSnapshotId: string;
    actualsSnapshotId: string;
    companyId: string;
    organisationId: string;
    propertyId: string;
    fiscalYear: number;
    lines: ImportedActualLine[];
}

async function upsertWorkingBudgetActualBaselines(
    tx: Prisma.TransactionClient,
    input: UpsertWorkingBudgetActualBaselinesInput
): Promise<number> {
    let upsertedCount = 0;

    for (const line of input.lines) {
        await tx.budgetCalcLineBaseline.upsert({
            where: {
                snapshotId_lineCode: {
                    snapshotId: input.workingBudgetSnapshotId,
                    lineCode: line.lineCode
                }
            },
            update: {
                sourceSnapshotId: input.actualsSnapshotId,

                accountCode: line.accountCode,
                accountName: line.accountName,
                accountGroup: line.accountGroup,

                lineName: line.lineName,
                lineType: "ACCOUNT",
                parentLineCode: null,
                sortOrder: line.sortOrder,

                isEditable: false,
                isCalculated: false,
                isReference: true,

                janAmount: line.amounts.janAmount,
                febAmount: line.amounts.febAmount,
                marAmount: line.amounts.marAmount,
                aprAmount: line.amounts.aprAmount,
                mayAmount: line.amounts.mayAmount,
                junAmount: line.amounts.junAmount,
                julAmount: line.amounts.julAmount,
                augAmount: line.amounts.augAmount,
                sepAmount: line.amounts.sepAmount,
                octAmount: line.amounts.octAmount,
                novAmount: line.amounts.novAmount,
                decAmount: line.amounts.decAmount,
                fullYearAmount: line.amounts.fullYearAmount
            },
            create: {
                snapshotId: input.workingBudgetSnapshotId,
                sourceSnapshotId: input.actualsSnapshotId,

                companyId: input.companyId,
                organisationId: input.organisationId,
                propertyId: input.propertyId,
                fiscalYear: input.fiscalYear,
                snapshotType: "ACTUALS",

                coaId: null,
                accountCode: line.accountCode,
                accountName: line.accountName,
                accountGroup: line.accountGroup,

                lineCode: line.lineCode,
                lineName: line.lineName,
                lineType: "ACCOUNT",
                parentLineCode: null,
                sortOrder: line.sortOrder,

                isEditable: false,
                isCalculated: false,
                isReference: true,

                janAmount: line.amounts.janAmount,
                febAmount: line.amounts.febAmount,
                marAmount: line.amounts.marAmount,
                aprAmount: line.amounts.aprAmount,
                mayAmount: line.amounts.mayAmount,
                junAmount: line.amounts.junAmount,
                julAmount: line.amounts.julAmount,
                augAmount: line.amounts.augAmount,
                sepAmount: line.amounts.sepAmount,
                octAmount: line.amounts.octAmount,
                novAmount: line.amounts.novAmount,
                decAmount: line.amounts.decAmount,
                fullYearAmount: line.amounts.fullYearAmount
            }
        });

        upsertedCount++;
    }

    return upsertedCount;
}

function decimalZero(): Prisma.Decimal {
    return new Prisma.Decimal(0);
}