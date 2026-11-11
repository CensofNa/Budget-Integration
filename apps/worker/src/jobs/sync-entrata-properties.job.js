import { prisma } from "@budget-integration/database";
import { Prisma } from "@prisma/client";
import { fetchEntrataProperties } from "@budget-integration/connector-entrata";
import { createSourceHash } from "@budget-integration/integration-core";
import { asObject, asArray, getString, getNumberFromJson, getCredentialValue, chunkArray } from "@budget-integration/integration-core";
import { getSecretManager, IntegrationError } from "@budget-integration/integration-core";
function getEntrataPropertyArray(response) {
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
export async function syncEntrataPropertiesJob(input = {}) {
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
            // entities: true,
            entities: {
                where: {
                    entityName: "Property",
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
    const credentials = source.config.credentialsJson;
    const connection = source.config.connectionJson;
    // const apiKey =
    //   process.env.ENTRATA_API_KEY ||
    //   getCredentialValue(credentials, "apiKey");
    const apiKey = getCredentialValue(credentials, "apiKey") ??
        (getCredentialValue(credentials, "apiKeyRef")
            ? await getSecretManager().getSecret(getCredentialValue(credentials, "apiKeyRef"))
            : undefined);
    if (!apiKey) {
        // throw new Error("Entrata API key not found.");
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
    const baseUrl = getString(connection?.baseUrl) ||
        process.env.ENTRATA_BASE_URL ||
        "https://apis.entrata.com";
    const orgSlug = getString(connection?.orgSlug);
    if (!orgSlug) {
        // throw new Error("Entrata orgSlug is missing in IntegrationSourceConfig.connectionJson.");
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
                rawResponse: response,
                status: "RECEIVED"
            }
        });
        const propertyArray = getEntrataPropertyArray(response);
        let skippedCount = 0;
        let pendingTransformCount = 0;
        let stagedCount = 0;
        const itemsToProcess = [];
        const sourceRecordIdsSet = new Set();
        for (const property of propertyArray) {
            const sourceRecordId = getString(property.PropertyID);
            if (!sourceRecordId) {
                continue;
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
                property
            });
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
        const mapBySourceRecordId = new Map(existingMaps.map((m) => [m.sourceRecordId, m.sourceHash]));
        const stagingRecordsToCreate = [];
        for (const item of itemsToProcess) {
            const existingHash = mapBySourceRecordId.get(item.sourceRecordId);
            const isUnchanged = existingHash === item.sourceHash;
            if (isUnchanged) {
                skippedCount++;
            }
            else {
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
                rawPropertyPayload: item.property,
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
        console.log(`Entrata Property sync completed. Received: ${propertyArray.length}, Staged: ${stagedCount}, Skipped: ${skippedCount}, Pending transform: ${pendingTransformCount}.`);
        return {
            companyId: source.companyId,
            organisationId: source.organisationId,
            integrationSourceId: source.id,
            syncRunId: syncRun.id,
            stagingBatchId: batch.id,
            recordsStaged: pendingTransformCount
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
//# sourceMappingURL=sync-entrata-properties.job.js.map