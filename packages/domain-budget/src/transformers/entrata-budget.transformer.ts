import { Prisma, PrismaClient } from "@prisma/client";
import {
  asArray,
  asObject,
  getBoolean,
  getDecimal,
  getInt,
  getString,
  getStringOrNull,
  // nullableNumber,
  parseDate,
  type JsonObject
} from "@budget-integration/integration-core";
import { resolveSystemAdminUserId } from "@budget-integration/integration-core";

export interface TransformEntrataBudgetInput {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  stagingBudgetId: string;
  sourcePropertyId: string;
  sourceBudgetId: string;
  sourceHash?: string | null;
  rawBudgetPayload: Prisma.JsonValue;
  updateFiscalConfig?: boolean;
}

function getGlAccounts(budget: JsonObject): JsonObject[] {
  const glAccounts = asObject(budget.glAccounts);
  return asArray(glAccounts.glAccount);
}

function getBudgetMonths(glAccount: JsonObject): JsonObject[] {
  const budgetMonths = asObject(glAccount.budgetMonths);
  return asArray(budgetMonths.budgetMonth);
}

function getGlTotalAmount(glAccount: JsonObject): Prisma.Decimal | null {
  const glTotals = asObject(glAccount.glTotals);
  const totals = asArray(glTotals.glTotal);
  const firstTotal = totals[0];

  if (!firstTotal) {
    return null;
  }

  return getDecimal(firstTotal.amount);
}

export async function transformEntrataBudget(
  prisma: PrismaClient,
  input: TransformEntrataBudgetInput
): Promise<void> {
  const payload = asObject(input.rawBudgetPayload);
  const propertyPayload = asObject(payload.property);
  const budget = asObject(payload.budget);

  if (!input.sourcePropertyId) {
    throw new Error("Budget sourcePropertyId is missing.");
  }

  if (!input.sourceBudgetId) {
    throw new Error("Budget sourceBudgetId is missing.");
  }

  const propertyMap = await prisma.sourceRecordMap.findUnique({
    where: {
      companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        entityName: "Property",
        sourceRecordId: input.sourcePropertyId
      }
    }
  });
  console.log("Property map found for Entrata sourcePropertyId", {
    sourcePropertyId: input.sourcePropertyId
  });
  if (!propertyMap) {
    throw new Error(
      `Cannot resolve Property for Entrata sourcePropertyId ${input.sourcePropertyId}.`
    );
  }

  const propertyId = propertyMap.canonicalRecordId;

  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) {
    console.error("Mapped property not found in database.", {
      propertyId,
      sourcePropertyId: input.sourcePropertyId
    });

    // throw new Error(
    //   `Property ${propertyId} (mapped from sourcePropertyId ${input.sourcePropertyId}) does not exist. Ensure property sync runs before budget sync.`
    // );
  }

  await prisma.$transaction(
    async (tx) => {
      const systemAdminUserId = await resolveSystemAdminUserId(tx);
      const parsedFiscalYear = getInt(budget.fiscalYear) || null;
      const parsedFiscalStartDate = parseDate(budget.fiscalStartDate);
      const parsedFiscalEndDate = parseDate(budget.fiscalEndDate);

      const budgetData = {
        sourceBudgetId: input.sourceBudgetId,
        budgetName: getStringOrNull(budget.budgetName),
        budgetStatusTypeId: getStringOrNull(budget.budgetStatusTypeId),
        isDefault: getBoolean(budget.isDefault ?? true),
        fiscalYear: parsedFiscalYear,
        fiscalStartDate: parsedFiscalStartDate,
        fiscalEndDate: parsedFiscalEndDate,
        budgetTotal: getDecimal(budget.budgetTotal),
        currencyCode: getStringOrNull(propertyPayload.currencyCode),
        updatedSource: "ENTRATA",
        lastSyncedAt: new Date()
      };

      const propertyBudget = await tx.propertyBudget.upsert({
        where: {
          companyId_organisationId_propertyId_sourceBudgetId: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            propertyId,
            sourceBudgetId: input.sourceBudgetId
          }
        },
        update: budgetData,
        create: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          propertyId,
          ...budgetData,
          createdSource: "ENTRATA"
        }
      });

      if (input.updateFiscalConfig && property && parsedFiscalStartDate && parsedFiscalEndDate) {
        const startMonth = parsedFiscalStartDate.getUTCMonth() + 1;
        const endMonth = parsedFiscalEndDate.getUTCMonth() + 1;
        const budgetYearType = startMonth === 1 ? "CALENDAR_YEAR" : "FISCAL_YEAR";
        const targetBudgetYear = new Date().getUTCFullYear() + 1;
        const targetFiscalStartDate = new Date(Date.UTC(targetBudgetYear, startMonth - 1, 1));
        const targetFiscalEndDate = new Date(
          Date.UTC(endMonth < startMonth ? targetBudgetYear + 1 : targetBudgetYear, endMonth, 0)
        );

        const isFiscalUnchanged =
          property.budgetYear === targetBudgetYear &&
          property.budgetYearType === budgetYearType &&
          property.fiscalYearStartMonth === startMonth &&
          property.fiscalYearEndMonth === endMonth &&
          property.fiscalYearStartDate?.toISOString().slice(0, 10) === targetFiscalStartDate.toISOString().slice(0, 10) &&
          property.fiscalYearEndDate?.toISOString().slice(0, 10) === targetFiscalEndDate.toISOString().slice(0, 10);

        if (!isFiscalUnchanged) {
          await tx.property.update({
            where: { id: propertyId },
            data: {
              budgetYear: targetBudgetYear,
              budgetYearType,
              fiscalYearStartMonth: startMonth,
              fiscalYearEndMonth: endMonth,
              fiscalYearStartDate: targetFiscalStartDate,
              fiscalYearEndDate: targetFiscalEndDate,
              updatedSource: "ENTRATA",
              ...(systemAdminUserId ? { updatedBy: systemAdminUserId } : {})
            }
          });
        }
      }

      await tx.propertyBudgetGlAccount.deleteMany({
        where: {
          budgetId: propertyBudget.id
        }
      });

      const glAccounts = getGlAccounts(budget);
      const monthlyAmountsToCreate: any[] = [];

      for (const glAccount of glAccounts) {
        const sourceGlAccountId =
          getString(glAccount.id) ??
          getString(glAccount.accountNumber);

        if (!sourceGlAccountId) {
          continue;
        }

        const createdGl = await tx.propertyBudgetGlAccount.create({
          data: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            budgetId: propertyBudget.id,
            sourceGlAccountId,
            accountNumber: getStringOrNull(glAccount.accountNumber),
            accountName: getStringOrNull(glAccount.accountName),
            totalAmount: getGlTotalAmount(glAccount)
          }
        });

        const months = getBudgetMonths(glAccount);

        for (const month of months) {
          const monthDate = parseDate(month.month);

          if (!monthDate) {
            continue;
          }

          monthlyAmountsToCreate.push({
            companyId: input.companyId,
            organisationId: input.organisationId,
            budgetGlAccountId: createdGl.id,
            monthDate,
            monthNo: monthDate.getUTCMonth() + 1,
            fiscalYear: parsedFiscalYear,
            amount: getDecimal(month.amount)
          });
        }
      }

      if (monthlyAmountsToCreate.length > 0) {
        await tx.propertyBudgetMonthlyAmount.createMany({
          data: monthlyAmountsToCreate
        });
      }

      await tx.sourceRecordMap.upsert({
        where: {
          companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,
            entityName: "Budget",
            sourceRecordId: input.sourceBudgetId
          }
        },
        update: {
          canonicalTableName: "property_budgets",
          canonicalRecordId: propertyBudget.id,
          matchStatus: "AUTO_MATCHED",
          confidenceScore: new Prisma.Decimal("100.00"),
          isAuthoritative: true,
          sourceHash: input.sourceHash ?? null,
          lastSyncedAt: new Date()
        },
        create: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          integrationSourceId: input.integrationSourceId,
          entityName: "Budget",
          sourceRecordId: input.sourceBudgetId,
          canonicalTableName: "property_budgets",
          canonicalRecordId: propertyBudget.id,
          matchStatus: "AUTO_MATCHED",
          confidenceScore: new Prisma.Decimal("100.00"),
          isAuthoritative: true,
          sourceHash: input.sourceHash ?? null,
          lastSyncedAt: new Date()
        }
      });

    await tx.stagingBudget.update({
      where: {
        id: input.stagingBudgetId
      },
      data: {
        validationStatus: "VALID",
        transformStatus: "TRANSFORMED",
        transformedAt: new Date()
      }
    });
  }, {
    timeout: 300000  // 300 seconds - remote database needs time for large budget payloads
  });
}