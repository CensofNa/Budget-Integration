import "dotenv/config";
import { prisma } from "@budget-integration/database";
import {
  PgBossWorker as Worker,
  QueueNames,
  createLogger
} from "@budget-integration/integration-core";
import { stageBalanceSheetActualsJob } from "../jobs/stage-balance-sheet-actuals.job.js";

const logger = createLogger("budget-service", prisma);

export const stageBalanceSheetActualsWorker = new Worker(
  QueueNames.StageBalanceSheetActuals,
  async (job) => {
    if (job.name !== "stage-balance-sheet-actuals") {
      await logger.warn(`Unknown StageBalanceSheetActuals job ignored [jobName=${job.name}]`, {
        action: "WORKER_UNKNOWN_JOB",
        entityName: "BalanceSheetActuals",
        jobId: String(job.id)
      });
      return null;
    }

    await logger.info(`Balance Sheet Actuals staging worker started [syncRunId=${job.data?.syncRunId}]`, {
      action: "WORKER_BS_STAGE_STARTED",
      entityName: "BalanceSheetActuals",
      jobId: String(job.id),
      queueName: QueueNames.StageBalanceSheetActuals,
      syncRunId: job.data?.syncRunId,
      companyId: job.data?.companyId,
      organisationId: job.data?.organisationId,
      integrationSourceId: job.data?.integrationSourceId,
    });

    try {
      const result = await stageBalanceSheetActualsJob(job.data);

      await logger.info(`Balance Sheet Actuals staging worker completed [staged=${result?.rowsInsertedOrUpdated}]`, {
        action: "WORKER_BS_STAGE_COMPLETED",
        entityName: "BalanceSheetActuals",
        jobId: String(job.id),
        syncRunId: result?.syncRunId,
        companyId: job.data?.companyId,
        contextJson: { rowsInsertedOrUpdated: result?.rowsInsertedOrUpdated }
      });

      return result;
    } catch (error) {
      await logger.error(`Balance Sheet Actuals staging worker failed [jobId=${job.id}]`, error, {
        action: "WORKER_BS_STAGE_FAILED",
        entityName: "BalanceSheetActuals",
        jobId: String(job.id),
        queueName: QueueNames.StageBalanceSheetActuals,
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
