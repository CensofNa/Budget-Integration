import { prisma } from "@budget-integration/database";
import { Prisma } from "@prisma/client";
import { fetchEntrataProperties, EntrataBudgetConnector } from "@budget-integration/connector-entrata";
import { createSourceHash } from "@budget-integration/integration-core";
import {
  asObject,
  asArray,
  getString,
  getInt,
  parseDate,
  getNumberFromJson,
  getCredentialValue,
  chunkArray,
  type JsonObject
} from "@budget-integration/integration-core";
import { getSecretManager, IntegrationError, resolveSystemAdminUserId } from "@budget-integration/integration-core";

export interface SyncEntrataPropertiesJobInput {
  companyId?: string;
  organisationId?: string;
  integrationSourceId?: string;
  propertyId?: string;
  propertyIds?: string[];
  fiscalYears?: string;
  forceTransform?: boolean;
  updateFiscalConfig?: boolean | undefined;
}

export interface SyncEntrataPropertiesJobResult {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId: string;
  stagingBatchId: string;
  recordsStaged: number;
}


function getEntrataPropertyArray(response: unknown): JsonObject[] {
  const root = asObject(response);
  const responseObj = asObject(root.response);
  const resultObj = asObject(responseObj.result);
  const physicalPropertyObj = asObject(resultObj.PhysicalProperty);
  const properties = physicalPropertyObj.Property;

  if (!properties) {
    return [];
  }

  if (Array.isArray(properties)) {
    return properties.map(asObject);
  }

  return [asObject(properties)];
}

function getBudgetPropertiesFromResponse(response: unknown): JsonObject[] {
  const root = asObject(response);
  const responseObj = asObject(root.response);
  const resultObj = asObject(responseObj.result);
  const propertiesObj = asObject(resultObj.properties);

  return asArray(propertiesObj.property);
}

function getBudgetsFromProperty(property: JsonObject): JsonObject[] {
  const budgetsObj = asObject(property.budgets);
  return asArray(budgetsObj.budget);
}

export interface ParsedBudgetFiscalInfo {
  fiscalYear: number | null;
  fiscalStartDateRaw: string;
  fiscalEndDateRaw: string;
  fiscalStartDate: Date;
  fiscalEndDate: Date;
  startMonth: number;
  endMonth: number;
  budgetYearType: "CALENDAR_YEAR" | "FISCAL_YEAR";
}

function extractFiscalInfoFromBudgets(budgets: JsonObject[]): ParsedBudgetFiscalInfo | null {
  if (budgets.length === 0) return null;

  const selectedBudget =
    budgets.find((b) => {
      const def = getString(b.isDefault)?.toLowerCase();
      return def === "1" || def === "true" || b.isDefault === 1 || b.isDefault === true;
    }) ??
    budgets.find((b) => getString(b.fiscalStartDate) && getString(b.fiscalEndDate)) ??
    budgets[0];

  if (!selectedBudget) return null;

  const fiscalStartDateRaw = getString(selectedBudget.fiscalStartDate);
  const fiscalEndDateRaw = getString(selectedBudget.fiscalEndDate);
  if (!fiscalStartDateRaw || !fiscalEndDateRaw) return null;

  const fiscalStartDate = parseDate(fiscalStartDateRaw);
  const fiscalEndDate = parseDate(fiscalEndDateRaw);
  if (!fiscalStartDate || !fiscalEndDate) return null;

  const startMonth = fiscalStartDate.getUTCMonth() + 1;
  const endMonth = fiscalEndDate.getUTCMonth() + 1;
  const budgetYearType = startMonth === 1 ? "CALENDAR_YEAR" : "FISCAL_YEAR";
  const fiscalYear = getInt(selectedBudget.fiscalYear) ?? fiscalStartDate.getUTCFullYear();

  return {
    fiscalYear,
    fiscalStartDateRaw,
    fiscalEndDateRaw,
    fiscalStartDate,
    fiscalEndDate,
    startMonth,
    endMonth,
    budgetYearType
  };
}

export async function syncEntrataPropertiesJob(
  input: SyncEntrataPropertiesJobInput = {}
): Promise<SyncEntrataPropertiesJobResult | null> {
  const source = await prisma.integrationSource.findFirst({
    where: {
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.organisationId ? { organisationId: input.organisationId } : {}),
      ...(input.integrationSourceId ? { id: input.integrationSourceId } : {}),
      sourceType: "entrata",
      isActive: true,
      entities: {
        some: {
          entityName: "Property",
          isEnabled: true
        }
      }
    },
    include: {
      config: true,
      entities: {
        where: {
          entityName: {
            in: ["Property", "Budget"]
          },
          isEnabled: true
        }
      }
    }
  });

  if (!source || !source.config) {
    console.log("No active Entrata Property source found.");
    return null;
  }

  const requestId = `entrata-property-${Date.now()}`;

  const credentials = source.config.credentialsJson as JsonObject | null;
  const connection = source.config.connectionJson as JsonObject | null;

  const apiKey =
    getCredentialValue(credentials, "apiKey") ??
    (
      getCredentialValue(credentials, "apiKeyRef")
        ? await getSecretManager().getSecret(
          getCredentialValue(credentials, "apiKeyRef")!
        )
        : undefined
    );

  if (!apiKey) {
    throw new IntegrationError({
      message: "Entrata API key not found.",
      code: "ENTRATA_API_KEY_MISSING",
      category: "CONFIGURATION_ERROR",
      retryable: false,
      severity: "ERROR",
      context: {
        companyId: source.companyId,
        organisationId: source.organisationId,
        integrationSourceId: source.id,
        entityName: "Property"
      }
    });
  }

  const baseUrl =
    getString(connection?.baseUrl) ||
    process.env.ENTRATA_BASE_URL ||
    "https://apis.entrata.com";

  const orgSlug = getString(connection?.orgSlug);

  if (!orgSlug) {
    throw new IntegrationError({
      message: "Entrata orgSlug is missing in IntegrationSourceConfig.connectionJson.",
      code: "ENTRATA_ORG_SLUG_MISSING",
      category: "CONFIGURATION_ERROR",
      retryable: false,
      severity: "ERROR",
      context: {
        companyId: source.companyId,
        organisationId: source.organisationId,
        integrationSourceId: source.id,
        entityName: "Budget"
      }
    });
  }

  const budgetEntityConfig = source.entities.find((e) => e.entityName === "Budget");
  const budgetSyncSettings = (budgetEntityConfig?.syncSettingsJson as JsonObject | null) ?? null;
  const currentYear = new Date().getUTCFullYear();
  const configuredFiscalYears = getString(budgetSyncSettings?.fiscalYears);
  const defaultFiscalYears = Array.from(
    new Set([
      ...(configuredFiscalYears ? configuredFiscalYears.split(",").map((s) => s.trim()).filter(Boolean) : []),
      String(currentYear),
      String(currentYear + 1)
    ])
  ).join(",");
  const fiscalYears = getString(input.fiscalYears) ?? defaultFiscalYears;

  const syncRun = await prisma.integrationSyncRun.create({
    data: {
      companyId: source.companyId,
      organisationId: source.organisationId,
      integrationSourceId: source.id,
      entityName: "Property",
      syncType: "PROPERTY_SYNC",
      status: "STARTED",
      requestId
    }
  });

  try {
    const response = await fetchEntrataProperties({
      apiKey,
      baseUrl,
      orgSlug,
      requestId,
      showAllStatus: true,

      ...(input.propertyId
        ? { propertyId: input.propertyId }
        : input.propertyIds && input.propertyIds.length > 0
          ? { propertyIds: input.propertyIds }
          : {})
    });

    const batch = await prisma.stagingApiBatch.create({
      data: {
        companyId: source.companyId,
        organisationId: source.organisationId,
        integrationSourceId: source.id,
        syncRunId: syncRun.id,
        entityName: "Property",
        sourceMethod: "getProperties",
        requestId,
        responseCode: 200,
        rawRequest: {
          method: "getProperties",
          showAllStatus: true,
          ...(input.propertyId ? { propertyId: input.propertyId } : {}),
          ...(input.propertyIds ? { propertyIds: input.propertyIds } : {})
        },
        rawResponse: response as Prisma.InputJsonValue,
        status: "RECEIVED"
      }
    });

    const propertyArray = getEntrataPropertyArray(response);

    // Fetch getBudgets for the returned properties to extract fiscalStartDate and fiscalEndDate
    const fetchedPropertyIds = Array.from(
      new Set(
        propertyArray
          .map((p) => getString(p.PropertyID))
          .filter((id): id is string => !!id && id.trim().length > 0)
      )
    );

    const fiscalInfoByPropertyId = new Map<string, ParsedBudgetFiscalInfo>();

    if (fetchedPropertyIds.length > 0) {
      const budgetConnector = new EntrataBudgetConnector(
        {
          baseUrl,
          orgSlug,
          minDelayMs: getNumberFromJson(budgetSyncSettings?.minDelayMs, 1200)
        },
        { apiKey }
      );

      const budgetBatchSize = getNumberFromJson(budgetSyncSettings?.propertyBatchSize, 10);
      const propIdBatches = chunkArray(fetchedPropertyIds, budgetBatchSize > 0 ? budgetBatchSize : 10);

      for (let i = 0; i < propIdBatches.length; i++) {
        const propBatch = propIdBatches[i];
        if (!propBatch || propBatch.length === 0) continue;
        const propIdsCsv = propBatch.join(",");

        try {
          console.log(
            `[SyncEntrataPropertiesJob] Calling getBudgets (${i + 1}/${propIdBatches.length}) for PropertyIDs: ${propIdsCsv} (fiscalYears=${fiscalYears})`
          );
          const budgetResp = await budgetConnector.fetchBudgets({
            requestId: `entrata-prop-budgets-${Date.now()}-${i + 1}`,
            propertyIds: propIdsCsv,
            fiscalYears
          });

          const budgetProps = getBudgetPropertiesFromResponse(budgetResp);
          for (const bProp of budgetProps) {
            const bPropId = getString(bProp.propertyId);
            if (!bPropId) continue;
            const fiscalInfo = extractFiscalInfoFromBudgets(getBudgetsFromProperty(bProp));
            if (fiscalInfo) {
              fiscalInfoByPropertyId.set(bPropId, fiscalInfo);
            }
          }
        } catch (budgetErr) {
          console.warn(
            `[SyncEntrataPropertiesJob] Warning: failed calling getBudgets for property batch ${propIdsCsv}:`,
            budgetErr instanceof Error ? budgetErr.message : budgetErr
          );
        }
      }
    }

    let skippedCount = 0;
    let pendingTransformCount = 0;
    let stagedCount = 0;

    interface PropertyItemToProcess {
      sourceRecordId: string;
      parentSourceRecordId: string | null;
      propertyCode: string | null;
      propertyName: string | null;
      propertyType: string | null;
      sourceHash: string;
      property: JsonObject;
      fiscalInfo: ParsedBudgetFiscalInfo | null;
    }

    const itemsToProcess: PropertyItemToProcess[] = [];
    const sourceRecordIdsSet = new Set<string>();

    for (const property of propertyArray) {
      const sourceRecordId = getString(property.PropertyID);

      if (!sourceRecordId) {
        continue;
      }

      const fiscalInfo = fiscalInfoByPropertyId.get(sourceRecordId) ?? null;
      if (fiscalInfo) {
        property.FiscalStartDate = fiscalInfo.fiscalStartDateRaw;
        property.FiscalEndDate = fiscalInfo.fiscalEndDateRaw;
        if (fiscalInfo.fiscalYear !== null) {
          property.FiscalYear = String(fiscalInfo.fiscalYear);
        }
      }

      const sourceHash = createSourceHash(property);
      sourceRecordIdsSet.add(sourceRecordId);

      itemsToProcess.push({
        sourceRecordId,
        parentSourceRecordId: getString(property.ParentPropertyID) ?? null,
        propertyCode: getString(property.PropertyCode) ?? getString(property.PropertyID) ?? null,
        propertyName: getString(property.MarketingName) ?? null,
        propertyType: getString(property.Type) ?? null,
        sourceHash,
        property,
        fiscalInfo
      });
    }

    // Update existing properties table directly with fiscal configuration if available from getBudgets
    // or default to CALENDAR_YEAR when fiscal fields are unset
    const systemAdminUserId = await resolveSystemAdminUserId(prisma);
    const planningBudgetYear = currentYear + 1;
    const defaultCalStartDate = new Date(Date.UTC(planningBudgetYear, 0, 1));
    const defaultCalEndDate = new Date(Date.UTC(planningBudgetYear, 11, 31));

    for (const item of itemsToProcess) {
      const numericId = Number.parseInt(item.sourceRecordId, 10);
      const validNumericId = Number.isInteger(numericId) && numericId > 0 ? numericId : null;

      const orFilters: Prisma.PropertyWhereInput[] = [{ code: item.sourceRecordId }];
      if (item.propertyCode && item.propertyCode !== item.sourceRecordId) {
        orFilters.push({ code: item.propertyCode });
      }
      if (validNumericId !== null) {
        orFilters.push({ externalId: validNumericId });
      }

      const existingProp = await prisma.property.findFirst({
        where: {
          companyId: source.companyId,
          organisationId: source.organisationId,
          OR: orFilters
        },
        select: {
          id: true,
          budgetYear: true,
          budgetYearType: true,
          fiscalYearStartMonth: true,
          fiscalYearEndMonth: true,
          fiscalYearStartDate: true,
          fiscalYearEndDate: true,
          updatedBy: true
        }
      });

      if (existingProp) {
        const fi = item.fiscalInfo;
        if (fi) {
          const targetBudgetYear = planningBudgetYear;
          const targetStartDate = new Date(Date.UTC(targetBudgetYear, fi.startMonth - 1, 1));
          const targetEndDate = new Date(
            Date.UTC(fi.endMonth < fi.startMonth ? targetBudgetYear + 1 : targetBudgetYear, fi.endMonth, 0)
          );
          const isFiscalSame =
            existingProp.budgetYear === targetBudgetYear &&
            existingProp.budgetYearType === fi.budgetYearType &&
            existingProp.fiscalYearStartMonth === fi.startMonth &&
            existingProp.fiscalYearEndMonth === fi.endMonth &&
            existingProp.fiscalYearStartDate?.toISOString().slice(0, 10) === targetStartDate.toISOString().slice(0, 10) &&
            existingProp.fiscalYearEndDate?.toISOString().slice(0, 10) === targetEndDate.toISOString().slice(0, 10) &&
            (!systemAdminUserId || existingProp.updatedBy === systemAdminUserId);

          if (input.updateFiscalConfig && !isFiscalSame) {
            await prisma.property.update({
              where: { id: existingProp.id },
              data: {
                budgetYear: targetBudgetYear,
                budgetYearType: fi.budgetYearType,
                fiscalYearStartMonth: fi.startMonth,
                fiscalYearEndMonth: fi.endMonth,
                fiscalYearStartDate: targetStartDate,
                fiscalYearEndDate: targetEndDate,
                updatedSource: "ENTRATA",
                ...(systemAdminUserId ? { updatedBy: systemAdminUserId } : {})
              }
            });
            console.log(
              `[SyncEntrataPropertiesJob] Updated Property ${item.sourceRecordId} (${existingProp.id}) fiscal config: ` +
                `budgetYear=${targetBudgetYear}, type=${fi.budgetYearType}, start=${targetStartDate.toISOString().slice(0, 10)}, end=${targetEndDate.toISOString().slice(0, 10)}`
            );
          }
        } else {
          const targetYear = planningBudgetYear;
          const targetStartMonth = existingProp.fiscalYearStartMonth ?? 1;
          const targetEndMonth = existingProp.fiscalYearEndMonth ?? 12;
          const targetType = existingProp.budgetYearType ?? (targetStartMonth === 1 ? "CALENDAR_YEAR" : "FISCAL_YEAR");
          const targetStartDate =
            targetStartMonth === 1
              ? defaultCalStartDate
              : new Date(Date.UTC(targetYear, targetStartMonth - 1, 1));
          const targetEndDate =
            targetStartMonth === 1 && targetEndMonth === 12
              ? defaultCalEndDate
              : new Date(Date.UTC(targetEndMonth < targetStartMonth ? targetYear + 1 : targetYear, targetEndMonth, 0));

          const isDefaultSame =
            existingProp.budgetYear === targetYear &&
            existingProp.budgetYearType === targetType &&
            existingProp.fiscalYearStartMonth === targetStartMonth &&
            existingProp.fiscalYearEndMonth === targetEndMonth &&
            existingProp.fiscalYearStartDate?.toISOString().slice(0, 10) === targetStartDate.toISOString().slice(0, 10) &&
            existingProp.fiscalYearEndDate?.toISOString().slice(0, 10) === targetEndDate.toISOString().slice(0, 10) &&
            (!systemAdminUserId || existingProp.updatedBy === systemAdminUserId);

          if (input.updateFiscalConfig && !isDefaultSame) {
            await prisma.property.update({
              where: { id: existingProp.id },
              data: {
                budgetYear: targetYear,
                budgetYearType: targetType,
                fiscalYearStartMonth: targetStartMonth,
                fiscalYearEndMonth: targetEndMonth,
                fiscalYearStartDate: targetStartDate,
                fiscalYearEndDate: targetEndDate,
                updatedSource: "ENTRATA",
                ...(systemAdminUserId ? { updatedBy: systemAdminUserId } : {})
              }
            });
            console.log(
              `[SyncEntrataPropertiesJob] Defaulted Property ${item.sourceRecordId} (${existingProp.id}) to ${targetType} (budgetYear=${targetYear}): ` +
                `start=${targetStartDate.toISOString().slice(0, 10)}, end=${targetEndDate.toISOString().slice(0, 10)}`
            );
          }
        }
      }
    }

    const sourceRecordIds = Array.from(sourceRecordIdsSet);
    const existingMaps = sourceRecordIds.length > 0
      ? await prisma.sourceRecordMap.findMany({
          where: {
            companyId: source.companyId,
            organisationId: source.organisationId,
            integrationSourceId: source.id,
            entityName: "Property",
            sourceRecordId: {
              in: sourceRecordIds
            }
          },
          select: {
            sourceRecordId: true,
            sourceHash: true
          }
        })
      : [];

    const mapBySourceRecordId = new Map(
      existingMaps.map((m) => [m.sourceRecordId, m.sourceHash])
    );

    const stagingRecordsToCreate: Prisma.StagingPropertyCreateManyInput[] = [];
    const forceTransform = Boolean(
      input.forceTransform ||
      input.propertyId ||
      (input.propertyIds && input.propertyIds.length > 0)
    );

    for (const item of itemsToProcess) {
      const existingHash = mapBySourceRecordId.get(item.sourceRecordId);
      const isUnchanged = !forceTransform && existingHash === item.sourceHash;

      if (isUnchanged) {
        skippedCount++;
      } else {
        pendingTransformCount++;
      }

      stagedCount++;

      stagingRecordsToCreate.push({
        companyId: source.companyId,
        organisationId: source.organisationId,
        integrationSourceId: source.id,
        syncRunId: syncRun.id,
        stagingBatchId: batch.id,
        sourceRecordId: item.sourceRecordId,
        parentSourceRecordId: item.parentSourceRecordId,
        propertyCode: item.propertyCode,
        propertyName: item.propertyName,
        propertyType: item.propertyType,
        sourceHash: item.sourceHash,
        rawPropertyPayload: item.property as Prisma.InputJsonValue,
        validationStatus: isUnchanged ? "VALID" : "PENDING",
        transformStatus: isUnchanged ? "SKIPPED" : "PENDING",
        transformedAt: isUnchanged ? new Date() : null
      });
    }

    if (stagingRecordsToCreate.length > 0) {
      await prisma.stagingProperty.createMany({
        data: stagingRecordsToCreate
      });
    }

    await prisma.integrationSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: pendingTransformCount > 0 ? "STAGED" : "COMPLETED",
        recordsReceived: propertyArray.length,
        recordsStaged: stagedCount,
        recordsProcessed: skippedCount,
        completedAt: new Date()
      }
    });

    await prisma.stagingApiBatch.update({
      where: { id: batch.id },
      data: {
        status: "PARSED"
      }
    });

    console.log(
      `Entrata Property sync completed. Received: ${propertyArray.length}, Staged: ${stagedCount}, Skipped: ${skippedCount}, Pending transform: ${pendingTransformCount}.`
    );

    return {
      companyId: source.companyId,
      organisationId: source.organisationId,
      integrationSourceId: source.id,
      syncRunId: syncRun.id,
      stagingBatchId: batch.id,
      recordsStaged: pendingTransformCount
    };

  } catch (error) {
    await prisma.integrationSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date()
      }
    });

    throw error;
  }
}
