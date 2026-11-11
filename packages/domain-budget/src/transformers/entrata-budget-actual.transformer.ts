import { Prisma, type PrismaClient } from "@prisma/client";

import {
  asObject,
  getString
} from "@budget-integration/integration-core";

import { IntegrationError } from "@budget-integration/integration-core";

export interface TransformEntrataBudgetActualInput {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;

  stagingBudgetActualId: string;

  sourcePropertyId: string;
  sourceBudgetId: string;
  sourceGlTreeId: string;
  sourceGlAccountId: string;

  fiscalYear: number;
  postMonth: Date;

  accountingMethod: string;

  sourceHash: string;

  rawPayloadJson: unknown;
}

function getDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const cleaned = String(value).replace(/,/g, "").trim();

  if (cleaned.length === 0) {
    return null;
  }

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Prisma.Decimal(cleaned);
}


function getFiscalYearFromPostMonth(postMonth: Date): number {
  // Store actuals under the calendar year of the post month.
  // This avoids inserting 12/2025 actuals as fiscal_year 2026 when the source budget is FY 2026.
  return postMonth.getUTCFullYear();
}

function buildSourceRecordId(
  input: TransformEntrataBudgetActualInput,
  sourceGlAccountId: string
): string {
  return [
    input.sourcePropertyId,
    input.sourceBudgetId,
    input.sourceGlTreeId,
    sourceGlAccountId,
    input.postMonth.toISOString(),
    input.accountingMethod
  ].join(":");
}

export async function transformEntrataBudgetActual(
  prisma: PrismaClient,
  input: TransformEntrataBudgetActualInput
): Promise<void> {
  const payload = asObject(input.rawPayloadJson);

  const throwValidationError = (
    message: string,
    code: string,
    extraContext?: Record<string, unknown>
  ): never => {
    throw new IntegrationError({
      message,
      code,
      category: "VALIDATION_ERROR",
      retryable: false,
      severity: "ERROR",
      context: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        ...extraContext
      }
    });
  };

  const amountData = {
    mtdActual: getDecimal(payload.mtdActualIncome),
    mtdBudget: getDecimal(payload.mtdBudgetIncome),
    mtdVariance: getDecimal(payload.mtdVariance),
    mtdVariancePercent: getDecimal(payload.mtdPercentageVariance),
    ytdActual: getDecimal(payload.ytdActualIncome),
    ytdBudget: getDecimal(payload.ytdBudgetIncome),
    ytdVariance: getDecimal(payload.ytdVariance),
    ytdVariancePercent: getDecimal(payload.ytdPercentageVariance),
    annualBudget: getDecimal(payload.annualBudgetIncome)
  };

  const numericSourcePropId = Number.parseInt(input.sourcePropertyId, 10);
  const validNumericPropId =
    Number.isInteger(numericSourcePropId) && numericSourcePropId > 0
      ? numericSourcePropId
      : null;

  const property = await prisma.property.findFirst({
    where: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      OR: [
        { code: input.sourcePropertyId },
        ...(validNumericPropId !== null ? [{ externalId: validNumericPropId }] : [])
      ]
    }
  });

  if (!property) {
    throwValidationError(
      `Property not found for sourcePropertyId: ${input.sourcePropertyId}`,
      "BUDGET_ACTUAL_PROPERTY_NOT_FOUND",
      { sourcePropertyId: input.sourcePropertyId }
    );
  }

  const resolvedProperty = property!;

  const budget = await prisma.propertyBudget.findFirst({
    where: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      propertyId: resolvedProperty.id,
      sourceBudgetId: input.sourceBudgetId
    }
  });

  if (!budget) {
    throwValidationError(
      `Budget not found for sourceBudgetId: ${input.sourceBudgetId}`,
      "BUDGET_ACTUAL_BUDGET_NOT_FOUND",
      {
        sourceBudgetId: input.sourceBudgetId,
        propertyId: resolvedProperty.id
      }
    );
  }

  const resolvedBudget = budget!;

  const glTree = await prisma.glTree.findFirst({
    where: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      sourceGlTreeId: input.sourceGlTreeId
    }
  });

  if (!glTree) {
    throwValidationError(
      `GL Tree not found for sourceGlTreeId: ${input.sourceGlTreeId}`,
      "BUDGET_ACTUAL_GL_TREE_NOT_FOUND",
      { sourceGlTreeId: input.sourceGlTreeId }
    );
  }

  const resolvedGlTree = glTree!;

  const sourceGlAccountId =
    getString(payload.accountId)?.trim() ??
    input.sourceGlAccountId?.trim();

  if (!sourceGlAccountId) {
    throwValidationError(
      "GL Account id is missing in BudgetActual payload.",
      "BUDGET_ACTUAL_GL_ACCOUNT_ID_MISSING",
      {
        sourceGlTreeId: input.sourceGlTreeId,
        accountName: getString(payload.accountName)
      }
    );
  }

  const payloadAccountName = getString(payload.accountName)?.trim() ?? null;

  const ignoredAccountNames = new Set([
    "Other Operating Expenses"
  ]);

  if (payloadAccountName && ignoredAccountNames.has(payloadAccountName)) {
    await prisma.stagingBudgetActual.update({
      where: {
        id: input.stagingBudgetActualId
      },
      data: {
        validationStatus: "VALID",
        transformStatus: "SKIPPED",
        transformedAt: new Date(),
        validationErrors: Prisma.JsonNull,
        transformErrors: {
          reason: "IGNORED_SYNTHETIC_ACCOUNT",
          sourceGlAccountId,
          accountName: payloadAccountName
        }
      }
    });

    return;
  }

  const glAccount = await prisma.glAccount.findFirst({
    where: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      sourceGlAccountId
    }
  });

  if (!glAccount) {
    throwValidationError(
      `GL Account not found for sourceGlAccountId: ${sourceGlAccountId}`,
      "BUDGET_ACTUAL_GL_ACCOUNT_NOT_FOUND",
      {
        sourceGlAccountId,
        sourceGlTreeId: input.sourceGlTreeId,
        accountName: payloadAccountName
      }
    );
  }

  const resolvedGlAccount = glAccount!;

  let propertyBudgetGlAccount =
    await prisma.propertyBudgetGlAccount.findFirst({
      where: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        budgetId: resolvedBudget.id,
        sourceGlAccountId
      }
    });

  if (!propertyBudgetGlAccount) {
    propertyBudgetGlAccount =
      await prisma.propertyBudgetGlAccount.create({
        data: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          budgetId: resolvedBudget.id,
          sourceGlAccountId,
          accountNumber: resolvedGlAccount.accountNumber,
          accountName: resolvedGlAccount.accountName,
          totalAmount: new Prisma.Decimal(0)
        }
      });
  }

  const resolvedPropertyBudgetGlAccount = propertyBudgetGlAccount;
  const budgetGlAccountId = resolvedPropertyBudgetGlAccount.id;
  const glAccountId = resolvedGlAccount.id;
  const sourceRecordId = buildSourceRecordId(input, sourceGlAccountId);
  const actualFiscalYear = getFiscalYearFromPostMonth(input.postMonth);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const budgetActual = await tx.propertyBudgetActual.upsert({
      where: {
        companyId_organisationId_propertyId_budgetId_budgetGlAccountId_postMonth_accountingMethod: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          propertyId: resolvedProperty.id,
          budgetId: resolvedBudget.id,
          budgetGlAccountId,
          postMonth: input.postMonth,
          accountingMethod: input.accountingMethod
        }
      },
      update: {
        glTreeId: resolvedGlTree.id,
        glAccountId,
        fiscalYear: actualFiscalYear,
        sourceHash: input.sourceHash,
        ...amountData,
        updatedAt: new Date()
      },
      create: {
        companyId: input.companyId,
        organisationId: input.organisationId,

        propertyId: resolvedProperty.id,
        budgetId: resolvedBudget.id,
        budgetGlAccountId,

        glTreeId: resolvedGlTree.id,
        glAccountId,

        accountingMethod: input.accountingMethod,
        fiscalYear: actualFiscalYear,
        postMonth: input.postMonth,

        sourceHash: input.sourceHash,

        ...amountData
      }
    });

    await tx.sourceRecordMap.upsert({
      where: {
        companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          integrationSourceId: input.integrationSourceId,
          entityName: "BudgetActual",
          sourceRecordId
        }
      },
      update: {
        canonicalTableName: "property_budget_actuals",
        canonicalRecordId: budgetActual.id,
        sourceHash: input.sourceHash,
        matchStatus: "AUTO_MATCHED",
        lastSyncedAt: new Date()
      },
      create: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        entityName: "BudgetActual",
        sourceRecordId,
        canonicalTableName: "property_budget_actuals",
        canonicalRecordId: budgetActual.id,
        sourceHash: input.sourceHash,
        matchStatus: "AUTO_MATCHED",
        lastSyncedAt: new Date()
      }
    });

    await tx.stagingBudgetActual.update({
      where: {
        id: input.stagingBudgetActualId
      },
      data: {
        validationStatus: "VALID",
        transformStatus: "TRANSFORMED",
        transformedAt: new Date(),
        validationErrors: Prisma.JsonNull,
        transformErrors: Prisma.JsonNull
      }
    });
  }, {
    timeout: 45000  // 45 seconds to account for remote database latency
  });
}