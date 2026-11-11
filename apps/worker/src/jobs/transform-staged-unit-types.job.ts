import { Prisma } from "@prisma/client";

import { prisma } from "@budget-integration/database";
import { transformEntrataUnitType } from "@budget-integration/domain-property";

export interface TransformStagedUnitTypesJobInput {
  companyId?: string;
  organisationId?: string;
  integrationSourceId?: string;
  syncRunId?: string;
  stagingBatchId?: string;
  batchSize?: number;
}

export async function transformStagedUnitTypesJob(
  input: TransformStagedUnitTypesJobInput = {}
): Promise<{ transformed: number; failed: number }> {
  const batchSize = input.batchSize ?? 50;

  let totalTransformed = 0;
  let totalFailed = 0;

  const transformStartTime = new Date();

  const totalPendingBeforeStart = await prisma.stagingUnitType.count({
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

  console.log(`Starting UnitType transformation. Total records to be processed: ${totalPendingBeforeStart}`);

  while (true) {
    const stagedUnitTypes = await prisma.stagingUnitType.findMany({
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

    if (stagedUnitTypes.length === 0) {
      break;
    }

    for (const stagedUnitType of stagedUnitTypes) {
      try {
        await transformEntrataUnitType(prisma, {
          companyId: stagedUnitType.companyId,
          organisationId: stagedUnitType.organisationId,
          integrationSourceId: stagedUnitType.integrationSourceId,
          stagingUnitTypeId: stagedUnitType.id,
          sourcePropertyId: stagedUnitType.sourcePropertyId ?? "",
          sourceUnitTypeId: stagedUnitType.sourceUnitTypeId ?? "",
          sourceHash: stagedUnitType.sourceHash,
          rawUnitTypePayload: stagedUnitType.rawUnitTypePayload as Prisma.JsonValue
        });

        totalTransformed += 1;
      } catch (error) {
        totalFailed += 1;

        await prisma.stagingUnitType.update({
          where: {
            id: stagedUnitType.id
          },
          data: {
            validationStatus: "INVALID",
            transformStatus: "FAILED",
            transformErrors: {
              message: error instanceof Error ? error.message : String(error)
            }
          }
        });

        console.error(
          `Failed to transform staged unit type ${stagedUnitType.id}:`,
          error
        );
      }
    }

    const remainingPending = totalPendingBeforeStart - (totalTransformed + totalFailed);
    console.log(
      `UnitType transform batch processed. ` +
      `Total: ${totalPendingBeforeStart} | ` +
      `Processed: ${totalTransformed + totalFailed} | ` +
      `Passed: ${totalTransformed} | ` +
      `Failed: ${totalFailed} | ` +
      `Remaining: ${remainingPending}`
    );
  }

  // Touch lastSyncedAt for skipped (unchanged) unit types to protect them from cleanup
  if (input.syncRunId) {
    try {
      const skippedStaged = await prisma.stagingUnitType.findMany({
        where: {
          syncRunId: input.syncRunId,
          transformStatus: "SKIPPED",
          validationStatus: "VALID"
        },
        select: {
          sourceUnitTypeId: true,
          sourcePropertyId: true
        }
      });

      if (skippedStaged.length > 0) {
        const sourcePropertyIds = skippedStaged
          .map((u) => u.sourcePropertyId)
          .filter((id): id is string => !!id);

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

        const canonicalPropIds = Array.from(new Set(Array.from(propMap.values()).filter((id): id is string => !!id)));
        const sourceUnitTypeIds = skippedStaged
          .map((s) => s.sourceUnitTypeId)
          .filter((id): id is string => !!id);

        if (canonicalPropIds.length > 0 && sourceUnitTypeIds.length > 0) {
          const now = new Date();

          await prisma.propertyUnitType.updateMany({
            where: {
              propertyId: { in: canonicalPropIds },
              sourceUnitTypeId: { in: sourceUnitTypeIds }
            },
            data: {
              lastSyncedAt: now
            }
          });

          await prisma.sourceRecordMap.updateMany({
            where: {
              entityName: "UnitType",
              sourceRecordId: { in: sourceUnitTypeIds }
            },
            data: {
              lastSyncedAt: now
            }
          });
        }
      }
    } catch (touchError) {
      console.error("Error touching skipped unit types:", touchError);
    }
  }

  // Cleanup obsolete unit types that were not part of this sync run
  if (totalTransformed > 0 && input.syncRunId) {
    try {
      const stagedUnitTypesForProperties = await prisma.stagingUnitType.findMany({
        where: {
          syncRunId: input.syncRunId,
          transformStatus: "TRANSFORMED"
        },
        select: {
          sourcePropertyId: true
        },
        distinct: ["sourcePropertyId"]
      });

      const sourcePropertyIds = stagedUnitTypesForProperties
        .map((u) => u.sourcePropertyId)
        .filter((id): id is string => !!id);

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
          .filter((id): id is string => !!id);

        if (canonicalPropertyIds.length > 0) {
          const unitTypesToDelete = await prisma.propertyUnitType.findMany({
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
              sourceUnitTypeId: true
            }
          });

          const unitTypeIdsToDelete = unitTypesToDelete.map((u) => u.id);
          const sourceRecordIdsToDelete = unitTypesToDelete
            .map((u) => u.sourceUnitTypeId)
            .filter((id): id is string => !!id);

          if (unitTypeIdsToDelete.length > 0) {
            await prisma.$transaction([
              prisma.sourceRecordMap.deleteMany({
                where: {
                  ...(input.companyId ? { companyId: input.companyId } : {}),
                  ...(input.organisationId ? { organisationId: input.organisationId } : {}),
                  ...(input.integrationSourceId ? { integrationSourceId: input.integrationSourceId } : {}),
                  entityName: "UnitType",
                  sourceRecordId: {
                    in: sourceRecordIdsToDelete
                  }
                }
              }),
              prisma.propertyUnitType.deleteMany({
                where: {
                  id: {
                    in: unitTypeIdsToDelete
                  }
                }
              })
            ]);
            console.log(`Cleaned up ${unitTypeIdsToDelete.length} obsolete property unit types.`);
          }
        }
      }
    } catch (cleanupError) {
      console.error("Error cleaning up obsolete property unit types:", cleanupError);
    }
  }

  console.log(
    `========================================\n` +
    `UNIT TYPE SYNC CONSOLIDATED SUMMARY\n` +
    `========================================\n` +
    `- Total Records to Process: ${totalPendingBeforeStart}\n` +
    `- Successfully Transformed: ${totalTransformed}\n` +
    `- Failed to Transform:      ${totalFailed}\n` +
    `========================================`
  );

  return {
    transformed: totalTransformed,
    failed: totalFailed
  };
}