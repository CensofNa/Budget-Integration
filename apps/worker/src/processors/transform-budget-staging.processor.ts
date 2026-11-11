

import {
  prisma } from "@budget-integration/database";

import {
  PgBossWorker as Worker,
  QueueNames,
  type TransformBudgetStagingJobData
} from "@budget-integration/integration-core";

import {
  transformStagedBudgetsJob } from "../jobs/transform-staged-budgets.job.js";

export const transformBudgetStagingWorker =
  new Worker<TransformBudgetStagingJobData>(
    QueueNames.TransformBudgetStaging,
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

      const result = await transformStagedBudgetsJob({
        companyId: job.data.companyId,
        organisationId: job.data.organisationId,
        integrationSourceId: job.data.integrationSourceId,
        syncRunId: job.data.syncRunId,
        batchSize: 25
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
      concurrency: 1
    }
  );

transformBudgetStagingWorker.on("failed", async (job, error) => {
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

  console.error("Budget transform job failed:", {
    jobId: job.id,
    name: job.name,
    data: job.data,
    error: error.message,
    stack: error.stack
  });
});