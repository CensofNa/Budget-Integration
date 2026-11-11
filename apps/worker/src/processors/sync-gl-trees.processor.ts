import {
  Prisma } from "@prisma/client";


import {
  prisma } from "@budget-integration/database";

import {
  PgBossWorker as Worker,
  QueueNames,
  transformGlTreeStagingQueue,
  type SyncGlTreeJobData,
  acquireSyncLock
} from "@budget-integration/integration-core";

import {
  syncEntrataGlTreesJob } from "../jobs/sync-entrata-gl-trees.job.js";

console.log("Sync GL Tree processor loaded for queue:", QueueNames.SyncGlTree);

export const syncGlTreesWorker = new Worker<SyncGlTreeJobData>(
  QueueNames.SyncGlTree,
  async (job) => {
    
    console.log(`SyncGlTree worker received job: ${job.name}`, job.data);

    if (job.name !== "sync-entrata-gl-trees") {
      return null;
    }

    let lock: Awaited<ReturnType<typeof acquireSyncLock>> | null = null;

    try {
      console.log("Acquiring GL Tree sync lock...");

      lock = await acquireSyncLock({
        companyId: job.data.companyId,
        organisationId: job.data.organisationId,
        integrationSourceId: job.data.integrationSourceId,
        entityName: "GlTree",
        ttlMs: 60 * 60 * 1000
      });

      console.log("GL Tree sync lock acquired.");

      await prisma.integrationQueueJob.updateMany({
        where: {
          bullJobId: String(job.id)
        },
        data: {
          status: "ACTIVE",
          startedAt: new Date()
        }
      });

      const result = await syncEntrataGlTreesJob({
        companyId: job.data.companyId,
        organisationId: job.data.organisationId,
        integrationSourceId: job.data.integrationSourceId,
        entityName: "GlTree"
      });

      console.log("GL Tree sync result:", result);

      if (result && result.recordsPendingTransform > 0) {
        const payload = {
          companyId: result.companyId,
          organisationId: result.organisationId,
          integrationSourceId: result.integrationSourceId,
          syncRunId: result.syncRunId,
          stagingBatchId: result.stagingBatchId,
          entityName: "GlTree" as const,
          batchSize: 100
        };

        const queueRecord = await prisma.integrationQueueJob.create({
          data: {
            companyId: result.companyId,
            organisationId: result.organisationId,
            integrationSourceId: result.integrationSourceId,
            syncRunId: result.syncRunId,
            queueName: QueueNames.TransformGlTreeStaging,
            jobName: "transform-gl-tree-staging",
            entityName: "GlTree",
            status: "QUEUED",
            payloadJson: payload as Prisma.InputJsonValue
          }
        });

        const transformJob = await transformGlTreeStagingQueue.add(
          "transform-gl-tree-staging",
          payload,
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
      console.error("GL Tree sync processor error:", error);

      await prisma.integrationQueueJob.updateMany({
        where: {
          bullJobId: String(job.id)
        },
        data: {
          status: "FAILED",
          errorMessage:
            error instanceof Error ? error.message : String(error),
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
    concurrency: 1,
    lockDuration: 30 * 60 * 1000,
    lockRenewTime: 5 * 60 * 1000,
    stalledInterval: 60 * 1000,
    maxStalledCount: 1
  }
);

syncGlTreesWorker.on("failed", async (job, error) => {
  if (!job) return;

  console.error("GL Tree sync job failed:", {
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