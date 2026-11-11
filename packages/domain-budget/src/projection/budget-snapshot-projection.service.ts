import { Prisma, PrismaClient } from "@prisma/client";

import {
  ensureBudgetSnapshotForImportedBudget,
  ensureWorkingBudgetSnapshot
} from "./budget-snapshot-helper.js";

export interface ProjectBudgetSnapshotsInput {
  companyId: string;
  organisationId: string;
  integrationSourceId?: string;
  syncRunId?: string | null;
  propertyId?: string | null;
  fiscalYear?: number | null;
}

export interface ProjectBudgetSnapshotsResult {
  processedBudgets: number;

  createdWorkingBudgetSnapshots: number;
  skippedWorkingBudgetSnapshots: number;

  createdBudgetSnapshots: number;
  existingBudgetSnapshots: number;

  insertedOrUpdatedWorkingBudgetLines: number;
  insertedOrUpdatedBudgetLines: number;

  skippedBudgetsWithoutFiscalYear: number;
}

interface BudgetLineAmountSet {
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

interface ImportedBudgetLine {
  accountCode: string;
  accountName: string | null;
  accountGroup: string | null;
  lineCode: string;
  lineName: string;
  sortOrder: number;
  amounts: BudgetLineAmountSet;
}

/**
 * Projects imported Entrata budget data into final budget planning tables.
 *
 * Source tables:
 * - property_budgets
 * - property_budget_gl_accounts
 * - property_budget_monthly_amounts
 *
 * Target tables:
 * - budget_snapshots
 * - budget_calc_lines
 *
 * Important:
 * - WORKING_BUDGET is created and populated only once.
 * - Existing WORKING_BUDGET is never overwritten by Entrata.
 * - BUDGET is refreshed/upserted on every sync.
 * - budget_line_details are not touched here.
 */
export async function projectBudgetSnapshotsFromImportedBudget(
  prisma: PrismaClient,
  input: ProjectBudgetSnapshotsInput
): Promise<ProjectBudgetSnapshotsResult> {
  validateProjectBudgetSnapshotsInput(input);

  const result: ProjectBudgetSnapshotsResult = {
    processedBudgets: 0,

    createdWorkingBudgetSnapshots: 0,
    skippedWorkingBudgetSnapshots: 0,

    createdBudgetSnapshots: 0,
    existingBudgetSnapshots: 0,

    insertedOrUpdatedWorkingBudgetLines: 0,
    insertedOrUpdatedBudgetLines: 0,

    skippedBudgetsWithoutFiscalYear: 0
  };

  const propertyBudgets = await prisma.propertyBudget.findMany({
    where: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      isDefault: true,
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
    orderBy: [
      {
        propertyId: "asc"
      },
      {
        fiscalYear: "asc"
      }
    ]
  });

  for (const propertyBudget of propertyBudgets) {
    if (!propertyBudget.fiscalYear) {
      result.skippedBudgetsWithoutFiscalYear++;
      continue;
    }

    await prisma.$transaction(
      async (tx) => {
      const context = {
        companyId: propertyBudget.companyId,
        organisationId: propertyBudget.organisationId,
        propertyId: propertyBudget.propertyId,
        fiscalYear: propertyBudget.fiscalYear || new Date().getFullYear(),
        sourceSystem: "ENTRATA"
      };

      const workingBudgetSnapshot = await ensureWorkingBudgetSnapshot(tx, context);

      if (workingBudgetSnapshot.wasCreated) {
        result.createdWorkingBudgetSnapshots++;
      } else {
        result.skippedWorkingBudgetSnapshots++;
      }

      const budgetSnapshot = await ensureBudgetSnapshotForImportedBudget(
        tx,
        context
      );

      if (budgetSnapshot.wasCreated) {
        result.createdBudgetSnapshots++;
      } else {
        result.existingBudgetSnapshots++;
      }

      const importedLines = await buildImportedBudgetLines(tx, propertyBudget.id);

      /**
       * Rule:
       * WORKING_BUDGET should be populated only once.
       * If it already exists, do not overwrite it from Entrata.
       */
      if (workingBudgetSnapshot.wasCreated) {
        const workingLineCount = await upsertBudgetCalcLines(tx, {
          snapshotId: workingBudgetSnapshot.snapshotId,
          snapshotType: "WORKING_BUDGET",
          companyId: propertyBudget.companyId,
          organisationId: propertyBudget.organisationId,
          propertyId: propertyBudget.propertyId,
          fiscalYear: propertyBudget.fiscalYear ||2026,
          lines: importedLines,
          isEditable: true,
          isReference: false
        });

        result.insertedOrUpdatedWorkingBudgetLines += workingLineCount;
      } else {
        await updateExistingWorkingBudgetCalcLinesMetadata(tx, {
          snapshotId: workingBudgetSnapshot.snapshotId,
          companyId: propertyBudget.companyId,
          organisationId: propertyBudget.organisationId,
          propertyId: propertyBudget.propertyId,
          lines: importedLines
        });
      }

      /**
       * Rule:
       * BUDGET is source-system-owned.
       * It can be refreshed from Entrata every time.
       */
      const budgetLineCount = await upsertBudgetCalcLines(tx, {
        snapshotId: budgetSnapshot.snapshotId,
        snapshotType: "BUDGET",
        companyId: propertyBudget.companyId,
        organisationId: propertyBudget.organisationId,
        propertyId: propertyBudget.propertyId,
        fiscalYear: propertyBudget.fiscalYear ||2026,
        lines: importedLines,
        isEditable: false,
        isReference: false
      });

      },
      {
        timeout: 60000
      }
    );
  }

  return result;
}

function validateProjectBudgetSnapshotsInput(
  input: ProjectBudgetSnapshotsInput
): void {
  if (!input.companyId) {
    throw new Error("companyId is required for budget snapshot projection.");
  }

  if (!input.organisationId) {
    throw new Error("organisationId is required for budget snapshot projection.");
  }
}

async function buildImportedBudgetLines(
  tx: Prisma.TransactionClient,
  propertyBudgetId: string
): Promise<ImportedBudgetLine[]> {
  const glAccounts = await tx.propertyBudgetGlAccount.findMany({
    where: {
      budgetId: propertyBudgetId
    },
    orderBy: [
      {
        accountNumber: "asc"
      },
      {
        sourceGlAccountId: "asc"
      }
    ]
  });

  if (glAccounts.length === 0) {
    return [];
  }

  const glAccountIds = glAccounts.map((glAccount) => glAccount.id);

  const monthlyAmounts = await tx.propertyBudgetMonthlyAmount.findMany({
    where: {
      budgetGlAccountId: {
        in: glAccountIds
      }
    },
    orderBy: [
      {
        budgetGlAccountId: "asc"
      },
      {
        monthNo: "asc"
      }
    ]
  });

  const monthlyAmountsByGlAccountId = new Map<
    string,
    typeof monthlyAmounts
  >();

  for (const monthlyAmount of monthlyAmounts) {
    const existing =
      monthlyAmountsByGlAccountId.get(monthlyAmount.budgetGlAccountId) ?? [];

    existing.push(monthlyAmount);
    monthlyAmountsByGlAccountId.set(monthlyAmount.budgetGlAccountId, existing);
  }

  const importedLines: ImportedBudgetLine[] = [];

  let sortOrder = 1;

  for (const glAccount of glAccounts) {
    const accountCode =
      glAccount.accountNumber ?? glAccount.sourceGlAccountId ?? "";

    if (!accountCode) {
      continue;
    }

    const accountName = glAccount.accountName;
    const lineName = accountName ?? accountCode;

    const lineMonthlyAmounts =
      monthlyAmountsByGlAccountId.get(glAccount.id) ?? [];

    const amounts = buildBudgetLineAmountSet(
      lineMonthlyAmounts,
      glAccount.totalAmount
    );

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

function buildBudgetLineAmountSet(
  monthlyAmounts: Array<{
    monthNo: number | null;
    monthDate: Date | null;
    amount: Prisma.Decimal | null;
  }>,
  fallbackFullYearAmount: Prisma.Decimal | null
): BudgetLineAmountSet {
  const zero = decimalZero();

  const monthValues = new Map<number, Prisma.Decimal>();

  for (let monthNo = 1; monthNo <= 12; monthNo++) {
    monthValues.set(monthNo, zero);
  }

  for (const monthlyAmount of monthlyAmounts) {
    const monthNo =
      monthlyAmount.monthNo ??
      (monthlyAmount.monthDate ? monthlyAmount.monthDate.getMonth() + 1 : null);

    if (!monthNo || monthNo < 1 || monthNo > 12) {
      continue;
    }

    const existingValue = monthValues.get(monthNo) ?? zero;
    const amount = monthlyAmount.amount ?? zero;

    monthValues.set(monthNo, existingValue.plus(amount));
  }

  const calculatedFullYearAmount = Array.from(monthValues.values()).reduce(
    (total, amount) => total.plus(amount),
    zero
  );

  const hasMonthlyAmounts = monthlyAmounts.length > 0;

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
    fullYearAmount: hasMonthlyAmounts
      ? calculatedFullYearAmount
      : fallbackFullYearAmount ?? zero
  };
}

interface UpsertBudgetCalcLinesInput {
  snapshotId: string;
  snapshotType: "WORKING_BUDGET" | "BUDGET";
  companyId: string;
  organisationId: string;
  propertyId: string;
  fiscalYear: number;
  lines: ImportedBudgetLine[];
  isEditable: boolean;
  isReference: boolean;
}

async function upsertBudgetCalcLines(
  tx: Prisma.TransactionClient,
  input: UpsertBudgetCalcLinesInput
): Promise<number> {
  let upsertedCount = 0;

  // Call postgres function to resolve property-specific Chart of Accounts (respects exclusions/overrides)
  const coaAccounts = await tx.$queryRaw<
    Array<{ coa_id: string; account_code: string; group_name: string }>
  >`
    SELECT coa_id, account_code, group_name 
    FROM public.fn_get_coa_for_property(
      ${input.companyId}::uuid, 
      ${input.organisationId}::uuid, 
      ${input.propertyId}::uuid
    )
  `;

  const coaMap = new Map<string, { id: string; groupName: string }>();
  for (const coa of coaAccounts) {
    coaMap.set(coa.account_code, {
      id: coa.coa_id,
      groupName: coa.group_name ?? ""
    });
  }

  // Clear any existing lines for this snapshot to prevent duplicates
  await tx.budgetCalcLine.deleteMany({
    where: {
      snapshotId: input.snapshotId
    }
  });

  const linesToCreate = input.lines.map((line) => {
    const coaInfo = coaMap.get(line.accountCode);
    const coaId = coaInfo?.id ?? null;
    const accountGroup = coaInfo?.groupName ?? line.accountGroup;

    return {
      snapshotId: input.snapshotId,
      companyId: input.companyId,
      organisationId: input.organisationId,
      propertyId: input.propertyId,
      fiscalYear: input.fiscalYear,
      snapshotType: input.snapshotType,

      coaId,
      accountCode: line.accountCode,
      accountName: line.accountName,
      accountGroup,

      lineCode: line.lineCode,
      lineName: line.lineName,
      lineType: "ACCOUNT",
      parentLineCode: null,
      sortOrder: line.sortOrder,

      isEditable: input.isEditable,
      isCalculated: false,
      isReference: input.isReference,
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

      notes: null
    };
  });

  if (linesToCreate.length > 0) {
    await tx.budgetCalcLine.createMany({
      data: linesToCreate
    });
  }

  return linesToCreate.length;
}

function decimalZero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

async function updateExistingWorkingBudgetCalcLinesMetadata(
  tx: Prisma.TransactionClient,
  input: {
    snapshotId: string;
    companyId: string;
    organisationId: string;
    propertyId: string;
    lines: ImportedBudgetLine[];
  }
): Promise<void> {
  const coaAccounts = await tx.$queryRaw<
    Array<{ coa_id: string; account_code: string; group_name: string }>
  >`
    SELECT coa_id, account_code, group_name 
    FROM public.fn_get_coa_for_property(
      ${input.companyId}::uuid, 
      ${input.organisationId}::uuid, 
      ${input.propertyId}::uuid
    )
  `;

  const coaMap = new Map<string, { id: string; groupName: string }>();
  for (const coa of coaAccounts) {
    coaMap.set(coa.account_code, {
      id: coa.coa_id,
      groupName: coa.group_name ?? ""
    });
  }

  for (const line of input.lines) {
    const coaInfo = coaMap.get(line.accountCode);
    if (coaInfo) {
      await tx.budgetCalcLine.updateMany({
        where: {
          snapshotId: input.snapshotId,
          lineCode: line.lineCode
        },
        data: {
          coaId: coaInfo.id,
          accountGroup: coaInfo.groupName
        }
      });
    }
  }
}