import { prisma } from "@budget-integration/database";
import { PgBossWorker as Worker, QueueNames, transformPropertyStagingQueue, acquireSyncLock } from "@budget-integration/integration-core";
import { syncEntrataPropertiesJob } from "../jobs/sync-entrata-properties.job.js";
export const syncSourceWorker = new Worker(QueueNames.SyncProperty, async (job) => {
    console.log("SyncProperty worker received job:", job.name, job.data);
    if (job.name !== "sync-entrata-property") {
        return;
    }
    let lock = null;
    await prisma.integrationQueueJob.updateMany({
        where: { bullJobId: String(job.id) },
        data: { status: "ACTIVE", startedAt: new Date() }
    });
    try {
        lock = await acquireSyncLock({
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            entityName: job.data.entityName,
            ttlMs: 30 * 60 * 1000
        });
        const result = await syncEntrataPropertiesJob(job.data);
        if (result && result.recordsStaged > 0) {
            await transformPropertyStagingQueue.add("transform-property-staging", {
                companyId: result.companyId,
                organisationId: result.organisationId,
                integrationSourceId: result.integrationSourceId,
                syncRunId: result.syncRunId,
                stagingBatchId: result.stagingBatchId,
                entityName: "Property",
                ...(job.data.propertyId
                    ? { propertyId: job.data.propertyId }
                    : {})
            }, {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: 100,
                removeOnFail: 1000
            });
        }
        await prisma.integrationQueueJob.updateMany({
            where: { bullJobId: String(job.id) },
            data: { status: "COMPLETED", completedAt: new Date() }
        });
        return result;
    }
    catch (error) {
        // await logIntegrationError(
        //   prisma,
        //   {
        //     companyId: job.data.companyId,
        //     organisationId: job.data.organisationId,
        //     integrationSourceId: job.data.integrationSourceId,
        //     entityName: job.data.entityName,
        //     queueName: QueueNames.SyncProperty,
        //     jobName: job.name,
        //     bullJobId: String(job.id)
        //   },
        //   error
        // );
        await prisma.integrationQueueJob.updateMany({
            where: { bullJobId: String(job.id) },
            data: {
                status: "FAILED",
                errorMessage: error instanceof Error ? error.message : String(error),
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
    concurrency: 1
});
syncSourceWorker.on("failed", async (job, error) => {
    if (!job) {
        console.error("SyncProperty worker failed with an error but no job information is available:", {
            error: error instanceof Error ? error.message : String(error)
        });
        return;
    }
    console.error("Property sync job failed:", {
        jobId: job.id,
        name: job.name,
        data: job.data,
        error: error.message,
        stack: error.stack
    });
    await prisma.integrationQueueJob.updateMany({
        where: { bullJobId: String(job.id) },
        data: {
            status: "FAILED",
            errorMessage: error.message,
            completedAt: new Date()
        }
    });
});
//# sourceMappingURL=sync-property.processor.js.map