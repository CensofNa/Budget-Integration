import "dotenv/config";
import { prisma } from "@budget-integration/database";
import {
  PgBossWorker as Worker,
  QueueNames,
  createLogger
} from "@budget-integration/integration-core";
import { syncEntrataBalanceSheetActualsJob } from "../jobs/sync-entrata-balance-sheet-actuals.job.js";

const logger = createLogger("budget-service", prisma);

export const syncBalanceSheetActualsWorker = new Worker(
  QueueNames.SyncBalanceSheetActuals,
  async (job) => {
    if (job.name !== "sync-balance-sheet-actuals") {
      await logger.warn(`Unknown SyncBalanceSheetActuals job ignored [jobName=${job.name}]`, {
        action: "WORKER_UNKNOWN_JOB",
        entityName: "BalanceSheetActuals",
        jobId: String(job.id)
      });
      return null;
    }

    const propCount = Array.isArray(job.data?.propertyIds) ? job.data?.propertyIds.length : (job.data?.propertyIds ? 1 : "ALL");
    await logger.info(`Balance Sheet Actuals worker started processing job for FY${job.data?.fiscalYear} (${propCount} properties)`, {
      action: "WORKER_BS_ACTUALS_STARTED",
      entityName: "BalanceSheetActuals",
      jobId: String(job.id),
      queueName: QueueNames.SyncBalanceSheetActuals,
      companyId: job.data?.companyId,
      organisationId: job.data?.organisationId,
      integrationSourceId: job.data?.integrationSourceId,
      contextJson: { fiscalYear: job.data?.fiscalYear, propertiesCount: propCount }
    });

    try {
      const result = await syncEntrataBalanceSheetActualsJob(job.data);

      await logger.info(`Balance Sheet Actuals worker finished successfully [syncRunId=${result?.syncRunId}]`, {
        action: "WORKER_BS_ACTUALS_COMPLETED",
        entityName: "BalanceSheetActuals",
        jobId: String(job.id),
        syncRunId: result?.syncRunId,
        companyId: job.data?.companyId
      });

      return result;
    } catch (error) {
      await logger.error(`Balance Sheet Actuals worker failed during execution [jobId=${job.id}]`, error, {
        action: "WORKER_BS_ACTUALS_FAILED",
        entityName: "BalanceSheetActuals",
        jobId: String(job.id),
        queueName: QueueNames.SyncBalanceSheetActuals,
        companyId: job.data?.companyId,
        contextJson: { fiscalYear: job.data?.fiscalYear }
      });
      throw error;
    }
  },
  {
    concurrency: 1,
  }
);
