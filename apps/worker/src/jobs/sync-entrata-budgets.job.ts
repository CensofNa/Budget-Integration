import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";

import {
  asArray,
  asObject,
  chunkArray,
  createSourceHash,
  getCredentialValue,
  getNumberFromJson,
  getSecretManager,
  getString,
  parseDate,
  IntegrationError,
  resolveSystemAdminUserId,
  type JsonObject
} from "@budget-integration/integration-core";

import { EntrataBudgetConnector } from "@budget-integration/connector-entrata";

export interface SyncEntrataBudgetsJobInput {
  companyId?: string;
  organisationId?: string;
  integrationSourceId?: string;
  propertyBatchSize?: number;

  fiscalYears?: string;
  budgetIds?: string;
  budgetStatusTypeIds?: string;
  propertyId?: string;
  propertyIds?: string[] | string;
  updateFiscalConfig?: boolean;
}

export interface SyncEntrataBudgetsJobResult {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId: string;
  recordsReceived: number;
  recordsStaged: number;
  recordsSkipped: number;
  recordsPendingTransform: number;
}

function getProperties(response: unknown): JsonObject[] {
  const root = asObject(response);
  const responseObj = asObject(root.response);
  const resultObj = asObject(responseObj.result);
  const propertiesObj = asObject(resultObj.properties);

  return asArray(propertiesObj.property);
}

function getBudgets(property: JsonObject): JsonObject[] {
  const budgetsObj = asObject(property.budgets);

  return asArray(budgetsObj.budget);
}

function getFiscalYearValue(value: unknown): number | null {
  const raw = getString(value);

  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isNaN(parsed) ? null : parsed;
}

function throwMissingEntrataConfig(
  message: string,
  code: string,
  source: {
    companyId: string;
    organisationId: string;
    id: string;
  },
  context?: Record<string, unknown>
): never {
  throw new IntegrationError({
    message,
    code,
    category: "CONFIGURATION_ERROR",
    retryable: false,
    severity: "ERROR",
    context: {
      companyId: source.companyId,
      organisationId: source.organisationId,
      integrationSourceId: source.id,
      entityName: "Budget",
      ...(context ?? {})
    }
  });
}

export async function syncEntrataBudgetsJob(
  input: SyncEntrataBudgetsJobInput = {}
): Promise<SyncEntrataBudgetsJobResult | null> {
  const source = await prisma.integrationSource.findFirst({
    where: {
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.organisationId ? { organisationId: input.organisationId } : {}),
      ...(input.integrationSourceId ? { id: input.integrationSourceId } : {}),

      sourceType: "entrata",
      isActive: true,

      entities: {
        some: {
          entityName: "Budget",
          isEnabled: true
        }
      }
    },
    include: {
      config: true,
      entities: {
        where: {
          entityName: "Budget",
          isEnabled: true
        }
      }
    }
  });

  if (!source || !source.config) {
    console.log("No active Entrata Budget source found.");

    return null;
  }

  const entityConfig = source.entities[0];

  const syncSettings = entityConfig?.syncSettingsJson as JsonObject | null;
  const credentials = source.config.credentialsJson as JsonObject | null;
  const connection = source.config.connectionJson as JsonObject | null;

  const apiKeyValue = getCredentialValue(credentials, "apiKey");
  const apiKeyRef = getCredentialValue(credentials, "apiKeyRef");

  const apiKey =
    apiKeyValue ??
    (apiKeyRef ? await getSecretManager().getSecret(apiKeyRef) : undefined);

  if (!apiKey) {
    throwMissingEntrataConfig(
      "Entrata API key is not configured.",
      "ENTRATA_API_KEY_MISSING",
      source,
      {
        apiKeyRefConfigured: !!apiKeyRef
      }
    );
  }

  const baseUrl = getString(connection?.baseUrl) ?? "https://apis.entrata.com";
  const orgSlug = getString(connection?.orgSlug);

  if (!orgSlug) {
    throwMissingEntrataConfig(
      "Entrata orgSlug is missing in IntegrationSourceConfig.connectionJson.",
      "ENTRATA_ORG_SLUG_MISSING",
      source
    );
  }

  const propertyBatchSize =
    input.propertyBatchSize ??
    getNumberFromJson(syncSettings?.propertyBatchSize, 1);

  const minDelayMs = getNumberFromJson(syncSettings?.minDelayMs, 1200);

  const fiscalYears =
    getString(input.fiscalYears) ??
    getString(syncSettings?.fiscalYears);

  if (!fiscalYears) {
    throwMissingEntrataConfig(
      "Budget fiscalYears is required for getBudgets sync.",
      "BUDGET_FISCAL_YEARS_MISSING",
      source
    );
  }

  const budgetIds =
    getString(input.budgetIds) ??
    getString(syncSettings?.budgetIds) ??
    "";

  const budgetStatusTypeIds =
    getString(input.budgetStatusTypeIds) ??
    getString(syncSettings?.budgetStatusTypeIds) ??
    "";


  const budgetConnector = new EntrataBudgetConnector(
    {
      baseUrl,
      orgSlug,
      minDelayMs
    },
    {
      apiKey
    }
  );

  const parsedRequestedIds: string[] | null = (() => {
    if (input.propertyIds) {
      if (Array.isArray(input.propertyIds)) {
        return input.propertyIds.map((id) => String(id).trim()).filter(Boolean);
      }
      if (typeof input.propertyIds === "string") {
        return input.propertyIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
      }
    }
    if (input.propertyId) {
      return [input.propertyId.trim()];
    }
    return null;
  })();

  const propertyRecords = await prisma.property.findMany({
    where: {
      companyId: source.companyId,
      organisationId: source.organisationId
    },
    select: {
      id: true,
      code: true,
      externalId: true
    }
  });

  const propertyIds = propertyRecords
    .filter((p) => {
      if (!parsedRequestedIds) return true;
      const matchesCode = p.code && parsedRequestedIds.includes(p.code);
      const matchesExternal = p.externalId && parsedRequestedIds.includes(String(p.externalId));
      return matchesCode || matchesExternal;
    })
    .map((p) => (p.externalId ? String(p.externalId) : p.code))
    .filter((code): code is string => !!code && code.trim().length > 0);

  if (propertyIds.length === 0) {
    console.log("No mapped Entrata property IDs found for Budget sync.");

    return null;
  }

  const propertyIdBatches = chunkArray(propertyIds, propertyBatchSize);

  console.log(
    `Budget sync found ${propertyIds.length} property IDs in ${propertyIdBatches.length} batches. Batch size: ${propertyBatchSize}. FiscalYears: ${fiscalYears}.`
  );

  const syncRun = await prisma.integrationSyncRun.create({
    data: {
      companyId: source.companyId,
      organisationId: source.organisationId,
      integrationSourceId: source.id,
      entityName: "Budget",
      syncType: "BUDGET_SYNC",
      status: "STARTED",
      requestId: `entrata-budgets-${Date.now()}`
    }
  });

  let totalReceived = 0;
  let totalStaged = 0;
  let totalSkipped = 0;
  let totalPendingTransform = 0;
  let totalFailed = 0;

  try {
    for (let batchIndex = 0; batchIndex < propertyIdBatches.length; batchIndex++) {
      const propertyIdBatch = propertyIdBatches[batchIndex];

      if (!propertyIdBatch) {
        continue;
      }

      const propertyIdsForRequest = propertyIdBatch.join(",");

      if (!propertyIdsForRequest) {
        continue;
      }

      const requestId = `entrata-budgets--${propertyIdsForRequest}--${Date.now()}-${batchIndex + 1}`;

      console.log(
        `Calling getBudgets batch ${batchIndex + 1}/${propertyIdBatches.length}. PropertyIds: ${propertyIdsForRequest}`
      );

      try {
        const response = await budgetConnector.fetchBudgets({
          requestId,
          propertyIds: propertyIdsForRequest,
          fiscalYears,
          budgetIds,
          budgetStatusTypeIds
        });

        const batch = await prisma.stagingApiBatch.create({
          data: {
            companyId: source.companyId,
            organisationId: source.organisationId,
            integrationSourceId: source.id,
            syncRunId: syncRun.id,
            entityName: "Budget",
            sourceMethod: "getBudgets",
            requestId,
            responseCode: 200,
            rawRequest: {
              method: "getBudgets",
              propertyIds: propertyIdsForRequest,
              budgetIds,
              budgetStatusTypeIds,
              fiscalYears
            },
            rawResponse: response as Prisma.InputJsonValue,
            status: "RECEIVED"
          }
        });

        const properties = getProperties(response);

        if (properties.length === 0) {
          console.log(
            `No budgets found for getBudgets batch ${batchIndex + 1}/${propertyIdBatches.length}. PropertyIds: ${propertyIdsForRequest}`
          );
        }

        for (const property of properties) {
          const sourcePropertyId = getString(property.propertyId);
          const budgets = getBudgets(property);

          for (const budget of budgets) {
            const sourceBudgetId = getString(budget.id);

            if (!sourcePropertyId || !sourceBudgetId) {
              continue;
            }

            totalReceived++;

            // Ensure properties table fiscal configuration is updated from fiscalStartDate and fiscalEndDate
            const fiscalStartDate = parseDate(budget.fiscalStartDate);
            const fiscalEndDate = parseDate(budget.fiscalEndDate);
            const parsedFiscalYear = getFiscalYearValue(budget.fiscalYear);

            if (input.updateFiscalConfig && fiscalStartDate && fiscalEndDate) {
              const startMonth = fiscalStartDate.getUTCMonth() + 1;
              const endMonth = fiscalEndDate.getUTCMonth() + 1;
              const budgetYearType = startMonth === 1 ? "CALENDAR_YEAR" : "FISCAL_YEAR";
              const numericPropId = Number.parseInt(sourcePropertyId, 10);
              const validNumericPropId = Number.isInteger(numericPropId) && numericPropId > 0 ? numericPropId : null;

              const targetProp = await prisma.property.findFirst({
                where: {
                  companyId: source.companyId,
                  organisationId: source.organisationId,
                  OR: [
                    { code: sourcePropertyId },
                    ...(validNumericPropId !== null ? [{ externalId: validNumericPropId }] : [])
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

              if (targetProp) {
                const targetBudgetYear = new Date().getUTCFullYear() + 1;
                const targetFiscalStartDate = new Date(Date.UTC(targetBudgetYear, startMonth - 1, 1));
                const targetFiscalEndDate = new Date(
                  Date.UTC(endMonth < startMonth ? targetBudgetYear + 1 : targetBudgetYear, endMonth, 0)
                );
                const isFiscalUnchanged =
                  targetProp.budgetYear === targetBudgetYear &&
                  targetProp.budgetYearType === budgetYearType &&
                  targetProp.fiscalYearStartMonth === startMonth &&
                  targetProp.fiscalYearEndMonth === endMonth &&
                  targetProp.fiscalYearStartDate?.toISOString().slice(0, 10) === targetFiscalStartDate.toISOString().slice(0, 10) &&
                  targetProp.fiscalYearEndDate?.toISOString().slice(0, 10) === targetFiscalEndDate.toISOString().slice(0, 10);

                if (!isFiscalUnchanged) {
                  const systemAdminUserId = await resolveSystemAdminUserId(prisma);
                  await prisma.property.update({
                    where: { id: targetProp.id },
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
                  console.log(
                    `[SyncEntrataBudgetsJob] Updated Property ${sourcePropertyId} (${targetProp.id}) fiscal config: ` +
                      `budgetYear=${targetBudgetYear}, type=${budgetYearType}, start=${targetFiscalStartDate.toISOString().slice(0, 10)}, end=${targetFiscalEndDate.toISOString().slice(0, 10)}`
                  );
                }
              }
            }

            const budgetPayload = {
              property,
              budget
            };

            const sourceHash = createSourceHash(budgetPayload);

            const existingMap = await prisma.sourceRecordMap.findUnique({
              where: {
                companyId_organisationId_integrationSourceId_entityName_sourceRecordId:
                {
                  companyId: source.companyId,
                  organisationId: source.organisationId,
                  integrationSourceId: source.id,
                  entityName: "Budget",
                  sourceRecordId: sourceBudgetId
                }
              }
            });

            const isUnchanged = existingMap?.sourceHash === sourceHash;

            if (isUnchanged) {
              totalSkipped++;
            } else {
              totalPendingTransform++;
            }

            totalStaged++;

            await prisma.stagingBudget.create({
              data: {
                companyId: source.companyId,
                organisationId: source.organisationId,
                integrationSourceId: source.id,
                syncRunId: syncRun.id,
                stagingBatchId: batch.id,

                sourcePropertyId,
                sourceBudgetId,

                budgetName: getString(budget.budgetName) ?? null,
                fiscalYear: parsedFiscalYear,

                sourceHash,
                rawBudgetPayload: budgetPayload as Prisma.InputJsonValue,

                validationStatus: isUnchanged ? "VALID" : "PENDING",
                transformStatus: isUnchanged ? "SKIPPED" : "PENDING",
                transformedAt: isUnchanged ? new Date() : null
              }
            });
          }
        }

        await prisma.stagingApiBatch.update({
          where: {
            id: batch.id
          },
          data: {
            status: "PARSED"
          }
        });

        console.log(
          `Completed getBudgets batch ${batchIndex + 1}/${propertyIdBatches.length}.`
        );
      } catch (error) {
        totalFailed++;

        console.error(
          `Budget sync failed for batch ${batchIndex + 1}/${propertyIdBatches.length}. PropertyIds: ${propertyIdsForRequest}`,
          error
        );
      }
    }

    await prisma.integrationSyncRun.update({
      where: {
        id: syncRun.id
      },
      data: {
        status:
          totalFailed > 0 && totalPendingTransform > 0
            ? "PARTIAL_FAILED"
            : totalFailed > 0
              ? "FAILED"
              : totalPendingTransform > 0
                ? "STAGED"
                : "COMPLETED",

        recordsReceived: totalReceived,
        recordsStaged: totalStaged,
        recordsProcessed: totalSkipped,
        recordsFailed: totalFailed,
        completedAt: new Date(),
        errorMessage:
          totalFailed > 0
            ? `${totalFailed} Budget batch(es) failed.`
            : null
      }
    });

    console.log(
      `Entrata Budget sync completed. Received: ${totalReceived}, Staged: ${totalStaged}, Skipped: ${totalSkipped}, Pending transform: ${totalPendingTransform}, Failed: ${totalFailed}.`
    );

    return {
      companyId: source.companyId,
      organisationId: source.organisationId,
      integrationSourceId: source.id,
      syncRunId: syncRun.id,
      recordsReceived: totalReceived,
      recordsStaged: totalStaged,
      recordsSkipped: totalSkipped,
      recordsPendingTransform: totalPendingTransform
    };
  } catch (error) {
    await prisma.integrationSyncRun.update({
      where: {
        id: syncRun.id
      },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date()
      }
    });

    throw error;
  }
}