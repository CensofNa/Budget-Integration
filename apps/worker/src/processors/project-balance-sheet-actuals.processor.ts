import "dotenv/config";
import { prisma } from "@budget-integration/database";
import {
  PgBossWorker as Worker,
  QueueNames,
  createLogger
} from "@budget-integration/integration-core";
import { projectBalanceSheetActualsJob } from "../jobs/project-balance-sheet-actuals.job.js";

const logger = createLogger("budget-service", prisma);

export const projectBalanceSheetActualsWorker = new Worker(
  QueueNames.ProjectBalanceSheetActuals,
  async (job) => {
    if (job.name !== "project-balance-sheet-actuals") {
      await logger.warn(`Unknown ProjectBalanceSheetActuals job ignored [jobName=${job.name}]`, {
        action: "WORKER_UNKNOWN_JOB",
        entityName: "BalanceSheetActuals",
        jobId: String(job.id)
      });
      return null;
    }

    await logger.info(`Balance Sheet Actuals projection worker started [syncRunId=${job.data?.syncRunId}]`, {
      action: "WORKER_BS_PROJECT_STARTED",
      entityName: "BalanceSheetActuals",
      jobId: String(job.id),
      queueName: QueueNames.ProjectBalanceSheetActuals,
      syncRunId: job.data?.syncRunId,
      companyId: job.data?.companyId,
      organisationId: job.data?.organisationId,
      integrationSourceId: job.data?.integrationSourceId,
    });

    try {
      const result = await projectBalanceSheetActualsJob(job.data);

      await logger.info(`Balance Sheet Actuals projection worker completed [calcLinesUpserted=${result?.totalCalcLinesUpserted}]`, {
        action: "WORKER_BS_PROJECT_COMPLETED",
        entityName: "BalanceSheetActuals",
        jobId: String(job.id),
        syncRunId: result?.syncRunId,
        companyId: job.data?.companyId,
        contextJson: {
          totalCalcLinesUpserted: result?.totalCalcLinesUpserted,
          propertyYearCount: result?.propertyYearCount,
        }
      });

      return result;
    } catch (error) {
      await logger.error(`Balance Sheet Actuals projection worker failed [jobId=${job.id}]`, error, {
        action: "WORKER_BS_PROJECT_FAILED",
        entityName: "BalanceSheetActuals",
        jobId: String(job.id),
        queueName: QueueNames.ProjectBalanceSheetActuals,
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
