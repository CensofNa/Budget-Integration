import "dotenv/config";
import { prisma } from "@budget-integration/database";
import {
  PgBossWorker as Worker,
  QueueNames,
  createLogger
} from "@budget-integration/integration-core";
import { transformBalanceSheetActualsJob } from "../jobs/transform-balance-sheet-actuals.job.js";

const logger = createLogger("budget-service", prisma);

export const transformBalanceSheetActualsWorker = new Worker(
  QueueNames.TransformBalanceSheetActuals,
  async (job) => {
    if (job.name !== "transform-balance-sheet-actuals") {
      await logger.warn(`Unknown TransformBalanceSheetActuals job ignored [jobName=${job.name}]`, {
        action: "WORKER_UNKNOWN_JOB",
        entityName: "BalanceSheetActuals",
        jobId: String(job.id)
      });
      return null;
    }

    await logger.info(`Balance Sheet Actuals transform worker started [syncRunId=${job.data?.syncRunId}]`, {
      action: "WORKER_BS_TRANSFORM_STARTED",
      entityName: "BalanceSheetActuals",
      jobId: String(job.id),
      queueName: QueueNames.TransformBalanceSheetActuals,
      syncRunId: job.data?.syncRunId,
      companyId: job.data?.companyId,
      organisationId: job.data?.organisationId,
      integrationSourceId: job.data?.integrationSourceId,
    });

    try {
      const result = await transformBalanceSheetActualsJob(job.data);

      await logger.info(`Balance Sheet Actuals transform worker completed [inserted=${result?.insertedCount}, updated=${result?.updatedCount}, prunedLogs=${result?.historyLogsPruned}]`, {
        action: "WORKER_BS_TRANSFORM_COMPLETED",
        entityName: "BalanceSheetActuals",
        jobId: String(job.id),
        syncRunId: result?.syncRunId,
        companyId: job.data?.companyId,
        contextJson: {
          insertedCount: result?.insertedCount,
          updatedCount: result?.updatedCount,
          warningCount: result?.warningCount,
          failedCount: result?.failedCount,
          historyLogsPruned: result?.historyLogsPruned,
        }
      });

      return result;
    } catch (error) {
      await logger.error(`Balance Sheet Actuals transform worker failed [jobId=${job.id}]`, error, {
        action: "WORKER_BS_TRANSFORM_FAILED",
        entityName: "BalanceSheetActuals",
        jobId: String(job.id),
        queueName: QueueNames.TransformBalanceSheetActuals,
        syncRunId: job.data?.syncRunId,
        companyId: job.data?.companyId,
      });
      throw error;
    }
  },
  {
    concurrency: 1,
  }
);
