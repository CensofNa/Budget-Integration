import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { transformEntrataPropertyUnit } from "@budget-integration/integration-core";
export async function transformStagedPropertyUnitsJob(input = {}) {
    const batchSize = input.batchSize ?? 50;
    let totalTransformed = 0;
    let totalFailed = 0;
    const transformStartTime = new Date();
    const totalPendingBeforeStart = await prisma.stagingPropertyUnit.count({
        where: {
            ...(input.companyId ? { companyId: input.companyId } : {}),
            ...(input.organisationId ? { organisationId: input.organisationId } : {}),
            ...(input.integrationSourceId ? { integrationSourceId: input.integrationSourceId } : {}),
            ...(input.syncRunId ? { syncRunId: input.syncRunId } : {}),
            ...(input.stagingBatchId ? { stagingBatchId: input.stagingBatchId } : {}),
            validationStatus: { in: ["PENDING", "VALID"] },
            transformStatus: "PENDING"
        }
    });
    console.log(`Starting PropertyUnit transformation. Total records to be processed: ${totalPendingBeforeStart}`);
    while (true) {
        const stagedUnits = await prisma.stagingPropertyUnit.findMany({
            where: {
                ...(input.companyId ? { companyId: input.companyId } : {}),
                ...(input.organisationId ? { organisationId: input.organisationId } : {}),
                ...(input.integrationSourceId ? { integrationSourceId: input.integrationSourceId } : {}),
                ...(input.syncRunId ? { syncRunId: input.syncRunId } : {}),
                ...(input.stagingBatchId ? { stagingBatchId: input.stagingBatchId } : {}),
                validationStatus: { in: ["PENDING", "VALID"] },
                transformStatus: "PENDING"
            },
            orderBy: {
                stagedAt: "asc"
            },
            take: batchSize
        });
        if (stagedUnits.length === 0) {
            break;
        }
        for (const stagedUnit of stagedUnits) {
            try {
                await transformEntrataPropertyUnit(prisma, {
                    companyId: stagedUnit.companyId,
                    organisationId: stagedUnit.organisationId,
                    integrationSourceId: stagedUnit.integrationSourceId,
                    stagingPropertyUnitId: stagedUnit.id,
                    sourcePropertyId: stagedUnit.sourcePropertyId ?? "",
                    sourceUnitId: stagedUnit.sourceUnitId ?? "",
                    remotePrimaryKey: stagedUnit.remotePrimaryKey,
                    // sourceHash: stagedUnit.sourceHash,
                    rawUnitPayload: stagedUnit.rawUnitPayload
                });
                totalTransformed += 1;
            }
            catch (error) {
                totalFailed += 1;
                await prisma.stagingPropertyUnit.update({
                    where: { id: stagedUnit.id },
                    data: {
                        validationStatus: "INVALID",
                        transformStatus: "FAILED",
                        transformErrors: {
                            message: error instanceof Error ? error.message : String(error)
                        }
                    }
                });
                console.error(`Failed to transform staged property unit ${stagedUnit.id}:`, error);
            }
        }
        const remainingPending = totalPendingBeforeStart - (totalTransformed + totalFailed);
        console.log(`PropertyUnit transform batch processed. ` +
            `Total: ${totalPendingBeforeStart} | ` +
            `Processed: ${totalTransformed + totalFailed} | ` +
            `Passed: ${totalTransformed} | ` +
            `Failed: ${totalFailed} | ` +
            `Remaining: ${remainingPending}`);
    }
    // Touch lastSyncedAt for skipped (unchanged) property units to protect them from cleanup
    if (input.syncRunId) {
        try {
            const skippedStaged = await prisma.stagingPropertyUnit.findMany({
                where: {
                    syncRunId: input.syncRunId,
                    transformStatus: "SKIPPED",
                    validationStatus: "VALID"
                },
                select: {
                    sourceUnitId: true,
                    sourcePropertyId: true
                }
            });
            if (skippedStaged.length > 0) {
                const sourcePropertyIds = skippedStaged
                    .map((u) => u.sourcePropertyId)
                    .filter((id) => !!id);
                const propertyMaps = await prisma.sourceRecordMap.findMany({
                    where: {
                        entityName: "Property",
                        sourceRecordId: { in: sourcePropertyIds }
                    },
                    select: {
                        canonicalRecordId: true,
                        sourceRecordId: true
                    }
                });
                const propMap = new Map(propertyMaps.map(m => [m.sourceRecordId, m.canonicalRecordId]));
                const canonicalPropIds = Array.from(new Set(Array.from(propMap.values()).filter((id) => !!id)));
                const sourceUnitIds = skippedStaged
                    .map((s) => s.sourceUnitId)
                    .filter((id) => !!id);
                if (canonicalPropIds.length > 0 && sourceUnitIds.length > 0) {
                    const now = new Date();
                    await prisma.propertyUnit.updateMany({
                        where: {
                            propertyId: { in: canonicalPropIds },
                            sourceUnitId: { in: sourceUnitIds }
                        },
                        data: {
                            lastSyncedAt: now
                        }
                    });
                    await prisma.sourceRecordMap.updateMany({
                        where: {
                            entityName: "PropertyUnit",
                            sourceRecordId: { in: sourceUnitIds }
                        },
                        data: {
                            lastSyncedAt: now
                        }
                    });
                }
            }
        }
        catch (touchError) {
            console.error("Error touching skipped property units:", touchError);
        }
    }
    // Cleanup obsolete units that were not part of this sync run
    if (totalTransformed > 0 && input.syncRunId) {
        try {
            const stagedUnitsForProperties = await prisma.stagingPropertyUnit.findMany({
                where: {
                    syncRunId: input.syncRunId,
                    transformStatus: "TRANSFORMED"
                },
                select: {
                    sourcePropertyId: true
                },
                distinct: ["sourcePropertyId"]
            });
            const sourcePropertyIds = stagedUnitsForProperties
                .map((u) => u.sourcePropertyId)
                .filter((id) => !!id);
            if (sourcePropertyIds.length > 0) {
                const propertyMaps = await prisma.sourceRecordMap.findMany({
                    where: {
                        ...(input.companyId ? { companyId: input.companyId } : {}),
                        ...(input.organisationId ? { organisationId: input.organisationId } : {}),
                        ...(input.integrationSourceId ? { integrationSourceId: input.integrationSourceId } : {}),
                        entityName: "Property",
                        sourceRecordId: {
                            in: sourcePropertyIds
                        }
                    },
                    select: {
                        canonicalRecordId: true
                    }
                });
                const canonicalPropertyIds = propertyMaps
                    .map((m) => m.canonicalRecordId)
                    .filter((id) => !!id);
                if (canonicalPropertyIds.length > 0) {
                    const unitsToDelete = await prisma.propertyUnit.findMany({
                        where: {
                            ...(input.companyId ? { companyId: input.companyId } : {}),
                            ...(input.organisationId ? { organisationId: input.organisationId } : {}),
                            propertyId: {
                                in: canonicalPropertyIds
                            },
                            lastSyncedAt: {
                                lt: transformStartTime
                            }
                        },
                        select: {
                            id: true,
                            sourceUnitId: true,
                            remotePrimaryKey: true
                        }
                    });
                    const unitIdsToDelete = unitsToDelete.map((u) => u.id);
                    const sourceRecordIdsToDelete = unitsToDelete
                        .map((u) => u.sourceUnitId ?? u.remotePrimaryKey)
                        .filter((id) => !!id);
                    if (unitIdsToDelete.length > 0) {
                        await prisma.$transaction([
                            prisma.sourceRecordMap.deleteMany({
                                where: {
                                    ...(input.companyId ? { companyId: input.companyId } : {}),
                                    ...(input.organisationId ? { organisationId: input.organisationId } : {}),
                                    ...(input.integrationSourceId ? { integrationSourceId: input.integrationSourceId } : {}),
                                    entityName: "PropertyUnit",
                                    sourceRecordId: {
                                        in: sourceRecordIdsToDelete
                                    }
                                }
                            }),
                            prisma.propertyUnit.deleteMany({
                                where: {
                                    id: {
                                        in: unitIdsToDelete
                                    }
                                }
                            })
                        ]);
                        console.log(`Cleaned up ${unitIdsToDelete.length} obsolete property units.`);
                    }
                }
            }
        }
        catch (cleanupError) {
            console.error("Error cleaning up obsolete property units:", cleanupError);
        }
    }
    console.log(`========================================\n` +
        `PROPERTY UNIT SYNC CONSOLIDATED SUMMARY\n` +
        `========================================\n` +
        `- Total Records to Process: ${totalPendingBeforeStart}\n` +
        `- Successfully Transformed: ${totalTransformed}\n` +
        `- Failed to Transform:      ${totalFailed}\n` +
        `========================================`);
    return {
        transformed: totalTransformed,
        failed: totalFailed
    };
}
//# sourceMappingURL=transform-staged-property-units.job.js.map