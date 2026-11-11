import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { createSourceHash, getSecretManager } from "@budget-integration/integration-core";
import { fetchEntrataPropertyUnits } from "@budget-integration/connector-entrata";
import { asObject, asArray, getString, getNumberFromJson, getCredentialValue, chunkArray } from "@budget-integration/integration-core";
function getEntrataPropertiesFromUnitResponse(response) {
    const root = asObject(response);
    const responseObj = asObject(root.response);
    const resultObj = asObject(responseObj.result);
    const propertiesObj = asObject(resultObj.properties);
    return asArray(propertiesObj.property);
}
function getUnitsFromProperty(property) {
    const unitsObj = asObject(property.units);
    return asArray(unitsObj.unit);
}
export async function syncEntrataPropertyUnitsJob(input = {}) {
    const source = await prisma.integrationSource.findFirst({
        where: {
            ...(input.companyId ? { companyId: input.companyId } : {}),
            ...(input.organisationId ? { organisationId: input.organisationId } : {}),
            ...(input.integrationSourceId ? { id: input.integrationSourceId } : {}),
            sourceType: "entrata",
            isActive: true,
            entities: {
                some: {
                    entityName: "PropertyUnit",
                    isEnabled: true
                }
            }
        },
        include: {
            config: true,
            entities: {
                where: {
                    entityName: "PropertyUnit",
                    isEnabled: true
                }
            }
        }
    });
    if (!source || !source.config) {
        console.log("No active Entrata PropertyUnit source found.");
        return null;
    }
    const credentials = source.config.credentialsJson;
    const connection = source.config.connectionJson;
    // const syncSettings = source.config.syncSettingsJson as JsonObject | null;
    const entityConfig = source.entities[0];
    const syncSettings = entityConfig?.syncSettingsJson;
    // const apiKey =
    //   process.env.ENTRATA_API_KEY ||
    //   getCredentialValue(credentials, "apiKey");
    const apiKey = getCredentialValue(credentials, "apiKey") ??
        (getCredentialValue(credentials, "apiKeyRef")
            ? await getSecretManager().getSecret(getCredentialValue(credentials, "apiKeyRef"))
            : undefined);
    if (!apiKey) {
        throw new Error("Entrata API key not found.");
    }
    const baseUrl = getString(connection?.baseUrl) ||
        process.env.ENTRATA_BASE_URL ||
        "https://apis.entrata.com";
    const orgSlug = getString(connection?.orgSlug);
    if (!orgSlug) {
        throw new Error("Entrata orgSlug is missing in IntegrationSourceConfig.connectionJson.");
    }
    // const propertyBatchSize =
    //   input.propertyBatchSize ??
    //   getNumberFromJson(syncSettings?.propertyUnitBatchSize, 1);
    const propertyBatchSize = input.propertyBatchSize ??
        getNumberFromJson(syncSettings?.propertyUnitBatchSize, 10);
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
        .filter((value) => !!value && value.trim().length > 0)
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
        console.log("No mapped Entrata property IDs found for PropertyUnit sync.", {
            propertyId: input.propertyId
        });
        return null;
    }
    const propertyIdBatches = chunkArray(propertyIds, propertyBatchSize);
    console.log(`PropertyUnit sync found ${propertyIds.length} distinct property IDs in ${propertyIdBatches.length} batches. Batch size: ${propertyBatchSize}.`);
    const syncRun = await prisma.integrationSyncRun.create({
        data: {
            companyId: source.companyId,
            organisationId: source.organisationId,
            integrationSourceId: source.id,
            entityName: "PropertyUnit",
            syncType: "PROPERTY_UNIT_SYNC",
            status: "STARTED",
            requestId: `entrata-property-units-${Date.now()}`
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
            const requestId = `entrata-property-units-${Date.now()}-${batchIndex + 1}`;
            console.log(`Calling getPropertyUnits batch ${batchIndex + 1}/${propertyIdBatches.length}. PropertyIds: ${propertyIdsForRequest}`);
            try {
                const response = await fetchEntrataPropertyUnits({
                    apiKey,
                    baseUrl,
                    orgSlug,
                    requestId,
                    propertyId: propertyIdsForRequest,
                    availableUnitsOnly: false,
                    usePropertyPreferences: false,
                    includeDisabledFloorplans: false,
                    includeDisabledUnits: true
                });
                console.log(`Received getPropertyUnits batch ${batchIndex + 1}/${propertyIdBatches.length}. PropertyIds: ${propertyIdsForRequest}`);
                const batch = await prisma.stagingApiBatch.create({
                    data: {
                        companyId: source.companyId,
                        organisationId: source.organisationId,
                        integrationSourceId: source.id,
                        syncRunId: syncRun.id,
                        entityName: "PropertyUnit",
                        sourceMethod: "getPropertyUnits",
                        requestId,
                        responseCode: 200,
                        rawRequest: {
                            method: "getPropertyUnits",
                            propertyIds: propertyIdsForRequest,
                            availableUnitsOnly: "0",
                            usePropertyPreferences: "0",
                            includeDisabledFloorplans: "0",
                            includeDisabledUnits: "1"
                        },
                        rawResponse: response,
                        status: "RECEIVED"
                    }
                });
                const responseProperties = getEntrataPropertiesFromUnitResponse(response);
                const itemsToProcess = [];
                const sourceRecordIdsSet = new Set();
                for (const responseProperty of responseProperties) {
                    const sourcePropertyId = getString(responseProperty.propertyId);
                    if (!sourcePropertyId) {
                        continue;
                    }
                    const units = getUnitsFromProperty(responseProperty);
                    totalReceived += units.length;
                    for (const unit of units) {
                        const sourceUnitId = getString(unit.id);
                        const remotePrimaryKey = getString(unit.remotePrimaryKey);
                        const sourceRecordId = sourceUnitId ?? remotePrimaryKey;
                        if (!sourceRecordId) {
                            continue;
                        }
                        const sourceHash = createSourceHash(unit);
                        sourceRecordIdsSet.add(sourceRecordId);
                        itemsToProcess.push({
                            sourcePropertyId,
                            sourceUnitId: sourceUnitId ?? null,
                            remotePrimaryKey: remotePrimaryKey ?? null,
                            sourceRecordId,
                            unitNumber: getString(unit.unitNumber) ?? null,
                            floorPlanName: getString(unit.floorplanName) ?? null,
                            unitTypeName: getString(unit.unitTypeName) ?? null,
                            sourceHash,
                            unit
                        });
                    }
                }
                const sourceRecordIds = Array.from(sourceRecordIdsSet);
                const existingMaps = sourceRecordIds.length > 0
                    ? await prisma.sourceRecordMap.findMany({
                        where: {
                            companyId: source.companyId,
                            organisationId: source.organisationId,
                            integrationSourceId: source.id,
                            entityName: "PropertyUnit",
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
                const mapBySourceRecordId = new Map(existingMaps.map((m) => [m.sourceRecordId, m.sourceHash]));
                const stagingRecordsToCreate = [];
                for (const item of itemsToProcess) {
                    const existingHash = mapBySourceRecordId.get(item.sourceRecordId);
                    const isUnchanged = existingHash === item.sourceHash;
                    if (isUnchanged) {
                        totalSkipped++;
                    }
                    else {
                        totalPendingTransform++;
                    }
                    totalStaged++;
                    stagingRecordsToCreate.push({
                        companyId: source.companyId,
                        organisationId: source.organisationId,
                        integrationSourceId: source.id,
                        syncRunId: syncRun.id,
                        stagingBatchId: batch.id,
                        sourcePropertyId: item.sourcePropertyId,
                        sourceUnitId: item.sourceUnitId,
                        remotePrimaryKey: item.remotePrimaryKey,
                        unitNumber: item.unitNumber,
                        floorPlanName: item.floorPlanName,
                        unitTypeName: item.unitTypeName,
                        sourceHash: item.sourceHash,
                        rawUnitPayload: item.unit,
                        validationStatus: isUnchanged ? "VALID" : "PENDING",
                        transformStatus: isUnchanged ? "SKIPPED" : "PENDING",
                        transformedAt: isUnchanged ? new Date() : null
                    });
                }
                if (stagingRecordsToCreate.length > 0) {
                    await prisma.stagingPropertyUnit.createMany({
                        data: stagingRecordsToCreate
                    });
                }
                await prisma.stagingApiBatch.update({
                    where: { id: batch.id },
                    data: {
                        status: "PARSED"
                    }
                });
            }
            catch (error) {
                totalFailed++;
                console.error(`PropertyUnit sync failed for batch ${batchIndex + 1}/${propertyIdBatches.length}. PropertyIds: ${propertyIdsForRequest}`, error);
                continue;
            }
        }
        await prisma.integrationSyncRun.update({
            where: { id: syncRun.id },
            data: {
                status: totalFailed > 0 && totalPendingTransform > 0
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
                errorMessage: totalFailed > 0
                    ? `${totalFailed} PropertyUnit batch(es) failed. Check worker logs for details.`
                    : null
            }
        });
        console.log(`Entrata PropertyUnit sync completed. Received: ${totalReceived}, Staged: ${totalStaged}, Skipped: ${totalSkipped}, Pending transform: ${totalPendingTransform}, Failed batches: ${totalFailed}.`);
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
    }
    catch (error) {
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
//# sourceMappingURL=sync-entrata-property-units.job.js.map