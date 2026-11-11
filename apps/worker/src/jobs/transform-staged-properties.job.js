import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { transformEntrataProperty } from "@budget-integration/integration-core";
export async function transformStagedPropertiesJob(input = {}) {
    const batchSize = input.batchSize ?? 50;
    let totalTransformed = 0;
    let totalFailed = 0;
    while (true) {
        const stagedProperties = await prisma.stagingProperty.findMany({
            where: {
                ...(input.companyId ? { companyId: input.companyId } : {}),
                ...(input.organisationId ? { organisationId: input.organisationId } : {}),
                ...(input.integrationSourceId ? { integrationSourceId: input.integrationSourceId } : {}),
                ...(input.syncRunId ? { syncRunId: input.syncRunId } : {}),
                ...(input.stagingBatchId ? { stagingBatchId: input.stagingBatchId } : {}),
                validationStatus: { in: ["PENDING", "VALID"] },
                transformStatus: "PENDING"
            },
            orderBy: { stagedAt: "asc" },
            take: batchSize
        });
        if (stagedProperties.length === 0)
            break;
        for (const stagedProperty of stagedProperties) {
            try {
                await transformEntrataProperty(prisma, {
                    companyId: stagedProperty.companyId,
                    organisationId: stagedProperty.organisationId,
                    integrationSourceId: stagedProperty.integrationSourceId,
                    stagingPropertyId: stagedProperty.id,
                    sourceRecordId: stagedProperty.sourceRecordId ?? "",
                    sourceHash: stagedProperty.sourceHash,
                    rawPropertyPayload: stagedProperty.rawPropertyPayload
                });
                totalTransformed++;
            }
            catch (error) {
                totalFailed++;
                await prisma.stagingProperty.update({
                    where: { id: stagedProperty.id },
                    data: {
                        validationStatus: "INVALID",
                        transformStatus: "FAILED",
                        transformErrors: {
                            message: error instanceof Error ? error.message : String(error)
                        }
                    }
                });
            }
        }
        console.log(`Transform batch processed. Total transformed: ${totalTransformed}, failed: ${totalFailed}`);
    }
    return {
        transformed: totalTransformed,
        failed: totalFailed
    };
}
//# sourceMappingURL=transform-staged-properties.job.js.map