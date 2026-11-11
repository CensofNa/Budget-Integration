import {
  Prisma } from "@prisma/client";


import {
  prisma } from "@budget-integration/database";

import {
  PgBossWorker as Worker,
  QueueNames,
  transformUnitTypeStagingQueue,
  acquireSyncLock,
  // logIntegrationError,
  type SyncUnitTypeJobData
} from "@budget-integration/integration-core";

import {
  syncEntrataUnitTypesJob } from "../jobs/sync-entrata-unit-types.job.js";

export const syncUnitTypesWorker = new Worker<SyncUnitTypeJobData>(
  QueueNames.SyncUnitType,
  async (job) => {
    console.log(`SyncUnitType worker received job: ${job.name}`, job.data);

    if (job.name !== "sync-entrata-unit-types") {
      return;
    }

    let lock: Awaited<ReturnType<typeof acquireSyncLock>> | null = null;

    await prisma.integrationQueueJob.updateMany({
      where: {
        bullJobId: String(job.id)
      },
      data: {
        status: "ACTIVE",
        startedAt: new Date()
      }
    });

    try {
      lock = await acquireSyncLock({
        companyId: job.data.companyId,
        organisationId: job.data.organisationId,
        integrationSourceId: job.data.integrationSourceId,
        entityName: job.data.entityName,
        ttlMs: 30 * 60 * 1000
      });

      const result = await syncEntrataUnitTypesJob({
        companyId: job.data.companyId,
        organisationId: job.data.organisationId,
        integrationSourceId: job.data.integrationSourceId,

        ...(job.data.propertyId ? { propertyId: job.data.propertyId } : {}),
        ...(job.data.propertyIds ? { propertyIds: job.data.propertyIds } : {}),
        ...(job.data.propertyBatchSize ? { propertyBatchSize: job.data.propertyBatchSize } : {})
      });

      console.log("UnitType sync result:", result);

      if (result && result.recordsPendingTransform > 0) {
        const queueRecord = await prisma.integrationQueueJob.create({
          data: {
            companyId: result.companyId,
            organisationId: result.organisationId,
            integrationSourceId: result.integrationSourceId,
            syncRunId: result.syncRunId,
            queueName: QueueNames.TransformUnitTypeStaging,
            jobName: "transform-unit-type-staging",
            entityName: "UnitType",
            status: "QUEUED",
            payloadJson: {
              companyId: result.companyId,
              organisationId: result.organisationId,
              integrationSourceId: result.integrationSourceId,
              syncRunId: result.syncRunId,
              entityName: "UnitType"
            } as Prisma.InputJsonValue
          }
        });

        const transformJob = await transformUnitTypeStagingQueue.add(
          "transform-unit-type-staging",
          {
            companyId: result.companyId,
            organisationId: result.organisationId,
            integrationSourceId: result.integrationSourceId,
            syncRunId: result.syncRunId,
            entityName: "UnitType"
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
          where: {
            id: queueRecord.id
          },
          data: {
            bullJobId: String(transformJob.id)
          }
        });
      }

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
    } catch (error) {
      console.error("UnitType sync processor error:", error);

      // await logIntegrationError(
      //   prisma,
      //   {
      //     companyId: job.data.companyId,
      //     organisationId: job.data.organisationId,
      //     integrationSourceId: job.data.integrationSourceId,
      //     entityName: job.data.entityName,
      //     queueName: QueueNames.SyncUnitType,
      //     jobName: job.name,
      //     bullJobId: String(job.id)
      //   },
      //   error
      // );

      await prisma.integrationQueueJob.updateMany({
        where: {
          bullJobId: String(job.id)
        },
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

syncUnitTypesWorker.on("failed", async (job, error) => {
  if (!job) return;

  console.error("UnitType sync job failed:", {
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