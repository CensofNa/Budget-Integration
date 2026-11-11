import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import {
  asArray,
  asObject,
  chunkArray,
  createSourceHash,
  getCredentialValue,
  getNumberFromJson,
  getString,
  type JsonObject
} from "@budget-integration/integration-core";
import { fetchEntrataUnitTypes } from "@budget-integration/connector-entrata";

import { getSecretManager } from "@budget-integration/integration-core";

export interface SyncEntrataUnitTypesJobInput {
  companyId?: string;
  organisationId?: string;
  integrationSourceId?: string;
  propertyBatchSize?: number;
  propertyId?: string;
  propertyIds?: string[];
}

export interface SyncEntrataUnitTypesJobResult {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId: string;
  recordsReceived: number;
  recordsStaged: number;
  recordsSkipped: number;
  recordsPendingTransform: number;
}

function getEntrataResult(response: unknown): JsonObject {
  return asObject(asObject(asObject(response).response).result);
}

function getEntrataResponsePropertyId(response: unknown): string | undefined {
  const resultObj = getEntrataResult(response);
  const propertyObj = asObject(resultObj.property);

  return getString(propertyObj.propertyId);
}

function getEntrataUnitTypes(response: unknown): JsonObject[] {
  const resultObj = getEntrataResult(response);
  const unitTypesObj = asObject(resultObj.unitTypes);

  return asArray(unitTypesObj.unitType);
}

function getSourceUnitTypeId(unitType: JsonObject): string | undefined {
  const identificationType = asObject(unitType.identificationType);

  return getString(identificationType.idValue);
}

function getFloorPlanDetails(unitType: JsonObject): {
  floorPlanId: string | null;
  floorPlanName: string | null;
} {
  const floorplanObj = asObject(unitType.floorplan);
  const firstKey = Object.keys(floorplanObj)[0];

  if (!firstKey) {
    return {
      floorPlanId: null,
      floorPlanName: null
    };
  }

  const firstFloorPlan = asObject(floorplanObj[firstKey]);
  const attributes = asObject(firstFloorPlan["@attributes"]);

  return {
    floorPlanId: getString(attributes.Id) ?? firstKey,
    floorPlanName: getString(firstFloorPlan["@value"]) ?? null
  };
}

export async function syncEntrataUnitTypesJob(
  input: SyncEntrataUnitTypesJobInput = {}
): Promise<SyncEntrataUnitTypesJobResult | null> {
  const source = await prisma.integrationSource.findFirst({
    where: {
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.organisationId ? { organisationId: input.organisationId } : {}),
      ...(input.integrationSourceId ? { id: input.integrationSourceId } : {}),
      sourceType: "entrata",
      isActive: true,
      entities: {
        some: {
          entityName: "UnitType",
          isEnabled: true
        }
      }
    },
    include: {
      config: true,
      entities: {
        where: {
          entityName: "UnitType",
          isEnabled: true
        }
      }
    }
  });

  if (!source || !source.config) {
    console.log("No active Entrata UnitType source found.");
    return null;
  }

  const entityConfig = source.entities[0];
  const syncSettings = entityConfig?.syncSettingsJson as JsonObject | null;

  const credentials = source.config.credentialsJson as JsonObject | null;
  const connection = source.config.connectionJson as JsonObject | null;

  // const apiKey = getCredentialValue(credentials, "apiKey");

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
    throw new Error("Entrata API key not configured.");
  }

  const baseUrl = getString(connection?.baseUrl) ?? "https://apis.entrata.com";
  const orgSlug = getString(connection?.orgSlug);

  if (!orgSlug) {
    throw new Error("Entrata orgSlug missing in IntegrationSourceConfig.connectionJson.");
  }

  // Entrata's getUnitTypes API takes a single propertyId per request.
  const propertyBatchSize = 1;

  const propertyMaps = await prisma.sourceRecordMap.findMany({
    where: {
      companyId: source.companyId,
      organisationId: source.organisationId,
      integrationSourceId: source.id,
      entityName: "Property",
      canonicalTableName: "properties",
      matchStatus: {
        in: ["AUTO_MATCHED", "MANUAL_MATCHED"]
      }
    },
    distinct: ["sourceRecordId"],
    orderBy: {
      sourceRecordId: "asc"
    }
  });

  const propertyIds = propertyMaps
    .map((propertyMap) => propertyMap.sourceRecordId)
    .filter((value): value is string => !!value && value.trim().length > 0)
    .filter((value) => {
      if (input.propertyId) {
        return value === input.propertyId;
      }
      if (input.propertyIds && input.propertyIds.length > 0) {
        return input.propertyIds.includes(value);
      }
      return true;
    });

  if (propertyIds.length === 0) {
    console.log("No mapped Entrata property IDs found for UnitType sync.", {
      propertyId: input.propertyId
    });

    return null;
  }

  const propertyIdBatches = chunkArray(propertyIds, propertyBatchSize);

  console.log(
    `UnitType sync found ${propertyIds.length} property IDs in ${propertyIdBatches.length} batches. Batch size: ${propertyBatchSize}.`
  );

  const syncRun = await prisma.integrationSyncRun.create({
    data: {
      companyId: source.companyId,
      organisationId: source.organisationId,
      integrationSourceId: source.id,
      entityName: "UnitType",
      syncType: "UNIT_TYPE_SYNC",
      status: "STARTED",
      requestId: `entrata-unit-types-${Date.now()}`
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

      const requestId = `entrata-unit-types-${Date.now()}-${batchIndex + 1}`;

      console.log(
        `Calling getUnitTypes batch ${batchIndex + 1}/${propertyIdBatches.length}. PropertyIds: ${propertyIdsForRequest}`
      );

      try {
        const response = await fetchEntrataUnitTypes({
          apiKey,
          baseUrl,
          orgSlug,
          requestId,
          propertyId: propertyIdsForRequest
        });

        console.log(
          `Received getUnitTypes batch ${batchIndex + 1}/${propertyIdBatches.length}. PropertyIds: ${propertyIdsForRequest}`
        );

        const responsePropertyId =
          getEntrataResponsePropertyId(response) ?? propertyIdsForRequest;

        const batch = await prisma.stagingApiBatch.create({
          data: {
            companyId: source.companyId,
            organisationId: source.organisationId,
            integrationSourceId: source.id,
            syncRunId: syncRun.id,
            entityName: "UnitType",
            sourceMethod: "getUnitTypes",
            requestId,
            responseCode: 200,
            rawRequest: {
              method: "getUnitTypes",
              propertyId: propertyIdsForRequest
            },
            rawResponse: response as Prisma.InputJsonValue,
            status: "RECEIVED"
          }
        });

        const unitTypes = getEntrataUnitTypes(response);
        totalReceived += unitTypes.length;

        interface UnitTypeItemToProcess {
          sourceUnitTypeId: string;
          unitTypeName: string | null;
          floorPlanId: string | null;
          floorPlanName: string | null;
          sourceHash: string;
          unitType: JsonObject;
        }

        const itemsToProcess: UnitTypeItemToProcess[] = [];
        const sourceUnitTypeIdsSet = new Set<string>();

        for (const unitType of unitTypes) {
          const sourceUnitTypeId = getSourceUnitTypeId(unitType);

          if (!sourceUnitTypeId) {
            continue;
          }

          const floorPlanDetails = getFloorPlanDetails(unitType);
          const sourceHash = createSourceHash(unitType);
          sourceUnitTypeIdsSet.add(sourceUnitTypeId);

          itemsToProcess.push({
            sourceUnitTypeId,
            unitTypeName: getString(unitType.name) ?? null,
            floorPlanId: floorPlanDetails.floorPlanId,
            floorPlanName: floorPlanDetails.floorPlanName,
            sourceHash,
            unitType
          });
        }

        const sourceUnitTypeIds = Array.from(sourceUnitTypeIdsSet);
        const existingMaps = sourceUnitTypeIds.length > 0
          ? await prisma.sourceRecordMap.findMany({
              where: {
                companyId: source.companyId,
                organisationId: source.organisationId,
                integrationSourceId: source.id,
                entityName: "UnitType",
                sourceRecordId: {
                  in: sourceUnitTypeIds
                }
              },
              select: {
                sourceRecordId: true,
                sourceHash: true
              }
            })
          : [];

        const mapBySourceUnitTypeId = new Map(
          existingMaps.map((m) => [m.sourceRecordId, m.sourceHash])
        );

        const stagingRecordsToCreate: Prisma.StagingUnitTypeCreateManyInput[] = [];

        for (const item of itemsToProcess) {
          const existingHash = mapBySourceUnitTypeId.get(item.sourceUnitTypeId);
          const isUnchanged = existingHash === item.sourceHash;

          if (isUnchanged) {
            totalSkipped++;
          } else {
            totalPendingTransform++;
          }

          totalStaged++;

          stagingRecordsToCreate.push({
            companyId: source.companyId,
            organisationId: source.organisationId,
            integrationSourceId: source.id,
            syncRunId: syncRun.id,
            stagingBatchId: batch.id,

            sourcePropertyId: responsePropertyId,
            sourceUnitTypeId: item.sourceUnitTypeId,

            unitTypeName: item.unitTypeName,
            floorPlanId: item.floorPlanId,
            floorPlanName: item.floorPlanName,

            sourceHash: item.sourceHash,
            rawUnitTypePayload: item.unitType as Prisma.InputJsonValue,

            validationStatus: isUnchanged ? "VALID" : "PENDING",
            transformStatus: isUnchanged ? "SKIPPED" : "PENDING",
            transformedAt: isUnchanged ? new Date() : null
          });
        }

        if (stagingRecordsToCreate.length > 0) {
          await prisma.stagingUnitType.createMany({
            data: stagingRecordsToCreate
          });
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
          `Completed getUnitTypes batch ${batchIndex + 1}/${propertyIdBatches.length}. UnitTypes: ${unitTypes.length}.`
        );
      } catch (error) {
        totalFailed++;

        console.error(
          `UnitType sync failed for batch ${batchIndex + 1}/${propertyIdBatches.length}. PropertyIds: ${propertyIdsForRequest}`,
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
            ? `${totalFailed} UnitType batch(es) failed.`
            : null
      }
    });

    console.log(
      `Entrata UnitType sync completed. Received: ${totalReceived}, Staged: ${totalStaged}, Skipped: ${totalSkipped}, Pending transform: ${totalPendingTransform}, Failed: ${totalFailed}.`
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