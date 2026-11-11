import { prisma } from "@budget-integration/database";
import { PgBossWorker as Worker, QueueNames, acquireSyncLock } from "@budget-integration/integration-core";
import { transformStagedGlTreesJob } from "../jobs/transform-staged-gl-trees.job.js";
console.log("Transform GL Tree processor loaded for queue:", QueueNames.TransformGlTreeStaging);
export const transformGlTreeStagingWorker = new Worker(QueueNames.TransformGlTreeStaging, async (job) => {
    console.log(`TransformGlTree worker received job: ${job.name}`, job.data);
    if (job.name !== "transform-gl-tree-staging") {
        return null;
    }
    let lock = null;
    try {
        console.log("Acquiring Transform GL Tree lock...");
        lock = await acquireSyncLock({
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            entityName: "TransformGlTree",
            ttlMs: 60 * 60 * 1000
        });
        console.log("Transform GL Tree lock acquired.");
        await prisma.integrationQueueJob.updateMany({
            where: {
                bullJobId: String(job.id)
            },
            data: {
                status: "ACTIVE",
                startedAt: new Date()
            }
        });
        const result = await transformStagedGlTreesJob({
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            ...(job.data.syncRunId
                ? { syncRunId: job.data.syncRunId }
                : {}),
            ...(job.data.stagingBatchId
                ? { stagingBatchId: job.data.stagingBatchId }
                : {}),
            batchSize: job.data.batchSize ?? 100
        });
        console.log("GL Tree transform completed:", result);
        await prisma.integrationQueueJob.updateMany({
            where: {
                bullJobId: String(job.id)
            },
            data: {
                status: "COMPLETED",
                completedAt: new Date()
            }
        });
        return result;
    }
    catch (error) {
        console.error("Transform GL Tree staging processor error:", error);
        await prisma.integrationQueueJob.updateMany({
            where: {
                bullJobId: String(job.id)
            },
            data: {
                status: "FAILED",
                errorMessage: error instanceof Error
                    ? error.message
                    : String(error),
                completedAt: new Date()
            }
        });
        throw error;
    }
    finally {
        if (lock) {
            await lock.release().catch(() => undefined);
        }
    }
}, {
    concurrency: 1,
    lockDuration: 30 * 60 * 1000,
    lockRenewTime: 5 * 60 * 1000,
    stalledInterval: 60 * 1000,
    maxStalledCount: 1
});
transformGlTreeStagingWorker.on("failed", async (job, error) => {
    if (!job)
        return;
    console.error("Transform GL Tree staging job failed:", {
        jobId: job.id,
        name: job.name,
        data: job.data,
        error: error.message,
        stack: error.stack
    });
    await prisma.integrationQueueJob.updateMany({
        where: {
            bullJobId: String(job.id)
        },
        data: {
            status: "FAILED",
            errorMessage: error.message,
            completedAt: new Date()
        }
    });
});
//# sourceMappingURL=transform-gl-tree-staging.processor.js.map