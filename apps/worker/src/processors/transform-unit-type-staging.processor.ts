

import {
  prisma } from "@budget-integration/database";

import {
  PgBossWorker as Worker,
  QueueNames,
  type TransformUnitTypeStagingJobData
} from "@budget-integration/integration-core";

import {
  transformStagedUnitTypesJob } from "../jobs/transform-staged-unit-types.job.js";

export const transformUnitTypeStagingWorker =
  new Worker<TransformUnitTypeStagingJobData>(
    QueueNames.TransformUnitTypeStaging,
    async (job) => {
      await prisma.integrationQueueJob.updateMany({
        where: {
          bullJobId: String(job.id)
        },
        data: {
          status: "ACTIVE",
          startedAt: new Date()
        }
      });

      const result = await transformStagedUnitTypesJob({
        companyId: job.data.companyId,
        organisationId: job.data.organisationId,
        integrationSourceId: job.data.integrationSourceId,
        syncRunId: job.data.syncRunId,
        batchSize: 50
      });

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
    },
    {
      concurrency: 2
    }
  );

transformUnitTypeStagingWorker.on("failed", async (job, error) => {
  if (!job) return;

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

  console.error("UnitType transform job failed:", {
    jobId: job.id,
    name: job.name,
    data: job.data,
    error: error.message,
    stack: error.stack
  });
});