import {
  Prisma } from "@prisma/client";

import {
  prisma } from "@budget-integration/database";
import {
  PgBossWorker as Worker,
  QueueNames,
  transformPropertyUnitStagingQueue,
  type SyncPropertyUnitJobData
} from "@budget-integration/integration-core";
import {
  syncEntrataPropertyUnitsJob } from "../jobs/sync-entrata-property-units.job.js";

export const syncPropertyUnitsWorker = new Worker<SyncPropertyUnitJobData>(
  QueueNames.SyncPropertyUnit,
  async (job) => {

    console.log(`SyncPropertyUnit worker received job: ${job.name}`, job.data);

    if (job.name !== "sync-entrata-property-units") {
      return;
    }

    await prisma.integrationQueueJob.updateMany({
      where: { bullJobId: String(job.id) },
      data: {
        status: "ACTIVE",
        startedAt: new Date()
      }
    });

const result = await syncEntrataPropertyUnitsJob({
  companyId: job.data.companyId,
  organisationId: job.data.organisationId,
  integrationSourceId: job.data.integrationSourceId,
 
  ...(job.data.propertyId ? { propertyId: job.data.propertyId } : {}),
  ...(job.data.propertyIds ? { propertyIds: job.data.propertyIds } : {}),
  ...(job.data.propertyBatchSize ? { propertyBatchSize: job.data.propertyBatchSize } : {})
});

    console.log("PropertyUnit sync result:", result);

    if (result && result.recordsPendingTransform > 0) {
      const queueRecord = await prisma.integrationQueueJob.create({
        data: {
          companyId: result.companyId,
          organisationId: result.organisationId,
          integrationSourceId: result.integrationSourceId,
          syncRunId: result.syncRunId,
          queueName: QueueNames.TransformPropertyUnitStaging,
          jobName: "transform-property-unit-staging",
          entityName: "PropertyUnit",
          status: "QUEUED",
          payloadJson: {
            companyId: result.companyId,
            organisationId: result.organisationId,
            integrationSourceId: result.integrationSourceId,
            syncRunId: result.syncRunId,
            entityName: "PropertyUnit"
          } as Prisma.InputJsonValue
        }
      });

      const transformJob = await transformPropertyUnitStagingQueue.add(
        "transform-property-unit-staging",
        {
          companyId: result.companyId,
          organisationId: result.organisationId,
          integrationSourceId: result.integrationSourceId,
          syncRunId: result.syncRunId,
          entityName: "PropertyUnit"
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          },
          removeOnComplete: 100,
          removeOnFail: 1000
        }
      );

      await prisma.integrationQueueJob.update({
        where: { id: queueRecord.id },
        data: {
          bullJobId: String(transformJob.id)
        }
      });
    }

    await prisma.integrationQueueJob.updateMany({
      where: { bullJobId: String(job.id) },
      data: {
        status: "COMPLETED",
        completedAt: new Date()
      }
    });

    return result;
  },
  {
  concurrency: 1,
  lockDuration: 30 * 60 * 1000,
  lockRenewTime: 5 * 60 * 1000,
  stalledInterval: 60 * 1000,
  maxStalledCount: 1
  }
);

syncPropertyUnitsWorker.on("failed", async (job, error) => {

  console.error("PropertyUnit sync job failed:", {
    jobId: job?.id,
    name: job?.name,
    data: job?.data,
    error: error.message,
    stack: error.stack
  });

  if (!job) return;

  await prisma.integrationQueueJob.updateMany({
    where: { bullJobId: String(job.id) },
    data: {
      status: "FAILED",
      errorMessage: error.message,
      completedAt: new Date()
    }
  });
});