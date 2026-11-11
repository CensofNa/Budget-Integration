
import {
  prisma } from "@budget-integration/database";
import {
  PgBossWorker as Worker,
  QueueNames,
  type TransformPropertyStagingJobData
} from "@budget-integration/integration-core";
import {
  transformStagedPropertiesJob } from "../jobs/transform-staged-properties.job.js";

export const transformPropertyStagingWorker = new Worker<TransformPropertyStagingJobData>(
  QueueNames.TransformPropertyStaging,
  async (job) => {
    await prisma.integrationQueueJob.updateMany({
      where: { bullJobId: String(job.id) },
      data: {
        status: "ACTIVE",
        startedAt: new Date()
      }
    });

    const input = {
      companyId: job.data.companyId,
      organisationId: job.data.organisationId,
      integrationSourceId: job.data.integrationSourceId,
      syncRunId: job.data.syncRunId,
      batchSize: 50,
      updateFiscalConfig: job.data.updateFiscalConfig,
      ...(job.data.stagingBatchId
        ? { stagingBatchId: job.data.stagingBatchId }
        : {})
    };

    const result = await transformStagedPropertiesJob(input);

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
    concurrency: 2
  }
);

transformPropertyStagingWorker.on("failed", async (job, error) => {
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