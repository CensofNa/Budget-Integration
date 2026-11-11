

import {
  prisma } from "@budget-integration/database";

import {
  PgBossWorker as Worker,
  QueueNames,
  acquireSyncLock,
  projectBudgetActualSnapshotsQueue,
  type TransformBudgetActualStagingJobData
} from "@budget-integration/integration-core";

import {
  transformStagedBudgetActualsJob } from "../jobs/transform-staged-budget-actuals.job.js";

async function enqueueBudgetActualSnapshotProjection(
  jobData: TransformBudgetActualStagingJobData
): Promise<void> {
  const stagedGroups = await prisma.stagingBudgetActual.findMany({
    where: {
      companyId: jobData.companyId,
      organisationId: jobData.organisationId,
      integrationSourceId: jobData.integrationSourceId,
      syncRunId: jobData.syncRunId,
      transformStatus: "TRANSFORMED"
    },
    select: {
      sourcePropertyId: true,
      fiscalYear: true
    },
    distinct: ["sourcePropertyId", "fiscalYear"]
  });

  const propertyFiscalYearPairs = stagedGroups.filter(
    (group): group is { sourcePropertyId: string; fiscalYear: number } =>
      !!group.sourcePropertyId && !!group.fiscalYear
  );

  if (propertyFiscalYearPairs.length === 0) {
    return;
  }

  const sourcePropertyIds = Array.from(
    new Set(propertyFiscalYearPairs.map((pair) => pair.sourcePropertyId))
  );

  const propertyMaps = await prisma.sourceRecordMap.findMany({
    where: {
      companyId: jobData.companyId,
      organisationId: jobData.organisationId,
      integrationSourceId: jobData.integrationSourceId,
      entityName: "Property",
      canonicalTableName: "properties",
      sourceRecordId: { in: sourcePropertyIds },
      matchStatus: { in: ["AUTO_MATCHED", "MANUAL_MATCHED"] }
    },
    select: {
      sourceRecordId: true,
      canonicalRecordId: true
    }
  });

  const propertyIdBySourceId = new Map(
    propertyMaps.map((map) => [map.sourceRecordId, map.canonicalRecordId])
  );

  for (const pair of propertyFiscalYearPairs) {
    const propertyId = propertyIdBySourceId.get(pair.sourcePropertyId);

    if (!propertyId) {
      console.warn(
        "[WARN] Skipping ProjectBudgetActualSnapshots enqueue: no canonical property mapping found.",
        { sourcePropertyId: pair.sourcePropertyId, fiscalYear: pair.fiscalYear }
      );
      continue;
    }

    await projectBudgetActualSnapshotsQueue.add(
      "project-budget-actual-snapshots",
      {
        companyId: jobData.companyId,
        organisationId: jobData.organisationId,
        integrationSourceId: jobData.integrationSourceId,
        entityName: "BudgetActual",
        syncRunId: jobData.syncRunId,
        propertyId,
        fiscalYear: pair.fiscalYear
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
  }

  console.log("[INFO] Queued ProjectBudgetActualSnapshots job(s).", {
    syncRunId: jobData.syncRunId,
    count: propertyFiscalYearPairs.length
  });
}

export const transformBudgetActualStagingWorker =
  new Worker<TransformBudgetActualStagingJobData>(
    QueueNames.TransformBudgetActualStaging,
    async (job) => {
      console.log("[INFO] TransformBudgetActual worker received job:", {
        jobId: job.id,
        name: job.name,
        data: job.data
      });

      if (job.name !== "transform-budget-actual-staging") {
        console.warn("[WARN] Unknown TransformBudgetActual job ignored.", {
          jobId: job.id,
          jobName: job.name
        });

        return null;
      }

      let lock: Awaited<ReturnType<typeof acquireSyncLock>> | null = null;

      try {
        lock = await acquireSyncLock({
          companyId: job.data.companyId,
          organisationId: job.data.organisationId,
          integrationSourceId: job.data.integrationSourceId,
          entityName: "TransformBudgetActual",
          ttlMs: 15 * 60 * 1000
        });

        await prisma.integrationQueueJob.updateMany({
          where: {
            bullJobId: String(job.id)
          },
          data: {
            status: "ACTIVE",
            startedAt: new Date()
          }
        });

        const result = await transformStagedBudgetActualsJob({
          companyId: job.data.companyId,
          organisationId: job.data.organisationId,
          integrationSourceId: job.data.integrationSourceId,
          syncRunId: job.data.syncRunId,
          ...(job.data.stagingBatchId
            ? { stagingBatchId: job.data.stagingBatchId }
            : {}),
          entityName: "BudgetActual",
          batchSize: 100
        });

        if (result.transformed > 0) {
          await enqueueBudgetActualSnapshotProjection(job.data);
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

        // console.log("[INFO] BudgetActual transform completed.", {
        //   jobId: job.id,
        //   result
        // });

        return result;
      } catch (error) {
        console.error("[ERROR] TransformBudgetActual processor failed.", {
          jobId: job.id,
          error
        });

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

transformBudgetActualStagingWorker.on("failed", async (job, error) => {
  if (!job) {
    return;
  }

  console.error("[ERROR] TransformBudgetActual job failed.", {
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