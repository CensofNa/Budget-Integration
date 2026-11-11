import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { transformEntrataGlTree } from "@budget-integration/integration-core";
const recordTypes = [
    "TREE",
    "BRANCH",
    "ACCOUNT"
];
function isValidRecordType(value) {
    return (value === "TREE" ||
        value === "BRANCH" ||
        value === "ACCOUNT");
}
async function markFailed(id, message) {
    await prisma.stagingGlTree.update({
        where: {
            id
        },
        data: {
            validationStatus: "INVALID",
            transformStatus: "FAILED",
            transformErrors: {
                message
            },
            transformedAt: new Date()
        }
    });
}
export async function transformStagedGlTreesJob(input = {}) {
    const batchSize = input.batchSize ?? 100;
    let totalTransformed = 0;
    let totalFailed = 0;
    while (true) {
        let processedAny = false;
        for (const currentRecordType of recordTypes) {
            const stagedGlTrees = await prisma.stagingGlTree.findMany({
                where: {
                    ...(input.companyId ? { companyId: input.companyId } : {}),
                    ...(input.organisationId ? { organisationId: input.organisationId } : {}),
                    ...(input.integrationSourceId
                        ? { integrationSourceId: input.integrationSourceId }
                        : {}),
                    ...(input.syncRunId ? { syncRunId: input.syncRunId } : {}),
                    ...(input.stagingBatchId
                        ? { stagingBatchId: input.stagingBatchId }
                        : {}),
                    recordType: currentRecordType,
                    validationStatus: {
                        in: ["PENDING", "VALID"]
                    },
                    transformStatus: "PENDING"
                },
                orderBy: {
                    createdAt: "asc"
                },
                take: batchSize
            });
            if (stagedGlTrees.length === 0) {
                continue;
            }
            processedAny = true;
            for (const stagedGlTree of stagedGlTrees) {
                const recordType = stagedGlTree.recordType;
                if (!isValidRecordType(recordType)) {
                    totalFailed++;
                    await markFailed(stagedGlTree.id, `Invalid GL Tree recordType: ${recordType}`);
                    continue;
                }
                if (!stagedGlTree.sourceGlTreeId) {
                    totalFailed++;
                    await markFailed(stagedGlTree.id, "sourceGlTreeId is missing.");
                    continue;
                }
                if (recordType === "BRANCH" &&
                    !stagedGlTree.sourceBranchId) {
                    totalFailed++;
                    await markFailed(stagedGlTree.id, "sourceBranchId is missing for BRANCH record.");
                    continue;
                }
                if (recordType === "ACCOUNT" &&
                    !stagedGlTree.sourceGlAccountId) {
                    totalFailed++;
                    await markFailed(stagedGlTree.id, "sourceGlAccountId is missing for ACCOUNT record.");
                    continue;
                }
                try {
                    await transformEntrataGlTree(prisma, {
                        companyId: stagedGlTree.companyId,
                        organisationId: stagedGlTree.organisationId,
                        integrationSourceId: stagedGlTree.integrationSourceId,
                        stagingGlTreeId: stagedGlTree.id,
                        recordType,
                        sourceRecordId: stagedGlTree.sourceRecordId,
                        sourceGlTreeId: stagedGlTree.sourceGlTreeId,
                        sourceBranchId: stagedGlTree.sourceBranchId,
                        sourceGlAccountId: stagedGlTree.sourceGlAccountId,
                        sourceHash: stagedGlTree.sourceHash,
                        rawGlTreePayload: stagedGlTree.rawPayloadJson
                    });
                    totalTransformed++;
                }
                catch (error) {
                    totalFailed++;
                    await markFailed(stagedGlTree.id, error instanceof Error
                        ? error.message
                        : String(error));
                    console.error(`Failed to transform staged GL Tree ${stagedGlTree.id}:`, error);
                }
            }
            console.log(`GL Tree ${currentRecordType} transform batch processed. Total transformed: ${totalTransformed}, failed: ${totalFailed}.`);
        }
        if (!processedAny) {
            break;
        }
    }
    return {
        transformed: totalTransformed,
        failed: totalFailed
    };
}
//# sourceMappingURL=transform-staged-gl-trees.job.js.map