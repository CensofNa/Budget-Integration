import { prisma } from "@budget-integration/database";

import {
  PgBossWorker as Worker,
  QueueNames,
  transformPropertyStagingQueue,
  acquireSyncLock,
  createLogger,
  type SyncPropertyJobData
} from "@budget-integration/integration-core";

import {
  syncEntrataPropertiesJob } from "../jobs/sync-entrata-properties.job.js";

const logger = createLogger("property-service", prisma);

export const syncSourceWorker = new Worker<SyncPropertyJobData>(
  QueueNames.SyncProperty,
  async (job) => {
    await logger.info("Property sync worker received job", {
      action: "WORKER_JOB_RECEIVED",
      entityName: "Property",
      jobId: String(job.id),
      queueName: QueueNames.SyncProperty,
      companyId: job.data.companyId,
      organisationId: job.data.organisationId,
      integrationSourceId: job.data.integrationSourceId,
      contextJson: job.data
    });

    if (job.name !== "sync-entrata-property") {
      return;
    }

    let lock: Awaited<ReturnType<typeof acquireSyncLock>> | null = null;

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
        await transformPropertyStagingQueue.add(
          "transform-property-staging",
          {
            companyId: result.companyId,
            organisationId: result.organisationId,
            integrationSourceId: result.integrationSourceId,
            syncRunId: result.syncRunId,
            stagingBatchId: result.stagingBatchId,
            entityName: "Property",
            updateFiscalConfig: job.data.updateFiscalConfig,
            ...(job.data.propertyId
              ? { propertyId: job.data.propertyId }
              : {})
          },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 1000
          }
        );

        await logger.info(`Property sync staged ${result.recordsStaged} records, queued transform job`, {
          action: "WORKER_TRANSFORM_QUEUED",
          entityName: "Property",
          jobId: String(job.id),
          queueName: "transform-property-staging",
          syncRunId: result.syncRunId,
          companyId: result.companyId,
          organisationId: result.organisationId,
          integrationSourceId: result.integrationSourceId,
          contextJson: {
            recordsStaged: result.recordsStaged,
            stagingBatchId: result.stagingBatchId
          }
        });
      }

      await prisma.integrationQueueJob.updateMany({
        where: { bullJobId: String(job.id) },
        data: { status: "COMPLETED", completedAt: new Date() }
      });

      await logger.info("Property sync worker successfully completed job", {
        action: "WORKER_JOB_COMPLETED",
        entityName: "Property",
        jobId: String(job.id),
        queueName: QueueNames.SyncProperty,
        syncRunId: result?.syncRunId,
        companyId: result?.companyId,
        organisationId: result?.organisationId,
        integrationSourceId: result?.integrationSourceId
      });

      return result;
    } catch (error) {
      await logger.error("Property sync worker failed to process job", error, {
        action: "WORKER_JOB_FAILED",
        entityName: "Property",
        jobId: String(job.id),
        queueName: QueueNames.SyncProperty,
        companyId: job.data.companyId,
        organisationId: job.data.organisationId,
        integrationSourceId: job.data.integrationSourceId,
        contextJson: job.data
      });

      await prisma.integrationQueueJob.updateMany({
        where: { bullJobId: String(job.id) },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date()
        }
      });

      throw error;
    } finally {
      if (lock) {
        await lock.release().catch(() => undefined);
      }
    }
  },
  {
    concurrency: 1
  }
);

syncSourceWorker.on("failed", async (job, error) => {
  if (!job) {
    await logger.error("SyncProperty worker failed with no job information available", error, {
      action: "WORKER_FAILED_NO_JOB",
      entityName: "Property"
    });
    return;
  }

  await logger.error(`Property sync job failed [jobId=${job.id}]`, error, {
    action: "WORKER_JOB_ON_FAILED",
    entityName: "Property",
    jobId: String(job.id),
    queueName: QueueNames.SyncProperty,
    contextJson: {
      name: job.name,
      data: job.data
    }
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