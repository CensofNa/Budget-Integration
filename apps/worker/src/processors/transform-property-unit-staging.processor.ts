
import {
  prisma } from "@budget-integration/database";
import {
  PgBossWorker as Worker,
  QueueNames,
  type TransformPropertyUnitStagingJobData
} from "@budget-integration/integration-core";
import {
  transformStagedPropertyUnitsJob } from "../jobs/transform-staged-property-units.job.js";

export const transformPropertyUnitStagingWorker =
    new Worker<TransformPropertyUnitStagingJobData>(
        QueueNames.TransformPropertyUnitStaging,
        async (job) => {
            await prisma.integrationQueueJob.updateMany({
                where: { bullJobId: String(job.id) },
                data: {
                    status: "ACTIVE",
                    startedAt: new Date()
                }
            });

            const result = await transformStagedPropertyUnitsJob({
                companyId: job.data.companyId,
                organisationId: job.data.organisationId,
                integrationSourceId: job.data.integrationSourceId,
                syncRunId: job.data.syncRunId,
                batchSize: 200
            });

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

transformPropertyUnitStagingWorker.on("failed", async (job, error) => {
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