import "dotenv/config";
import { prisma } from "@budget-integration/database";
import {
  PgBossWorker as Worker,
  QueueNames,
  createLogger
} from "@budget-integration/integration-core";

import { syncEntrataIncomeStatementActualsJob } from "../jobs/sync-entrata-income-statement-actuals.job.js";

const logger = createLogger("budget-service", prisma);

export const syncIncomeStatementActualsWorker = new Worker(
  QueueNames.SyncIncomeStatementActuals,
  async (job) => {
    if (job.name !== "sync-income-statement-actuals") {
      await logger.warn(`Unknown SyncIncomeStatementActuals job ignored [jobName=${job.name}]`, {
        action: "WORKER_UNKNOWN_JOB",
        entityName: "IncomeStatementActuals",
        jobId: String(job.id)
      });
      return null;
    }

    const propCount = job.data?.propertyIds?.length ?? "ALL";
    await logger.info(`Income Statement Actuals worker started processing job for FY${job.data?.fiscalYear} (${propCount} properties)`, {
      action: "WORKER_IS_ACTUALS_STARTED",
      entityName: "IncomeStatementActuals",
      jobId: String(job.id),
      queueName: QueueNames.SyncIncomeStatementActuals,
      companyId: job.data?.companyId,
      organisationId: job.data?.organisationId,
      integrationSourceId: job.data?.integrationSourceId,
      contextJson: { fiscalYear: job.data?.fiscalYear, propertiesCount: propCount, autoProcess: job.data?.autoProcess }
    });

    try {
      const result = await syncEntrataIncomeStatementActualsJob(job.data);

      await logger.info(`Income Statement Actuals worker finished successfully [syncRunId=${result?.syncRunId}]`, {
        action: "WORKER_IS_ACTUALS_COMPLETED",
        entityName: "IncomeStatementActuals",
        jobId: String(job.id),
        syncRunId: result?.syncRunId,
        companyId: job.data?.companyId
      });

      return result;
    } catch (error) {
      await logger.error(`Income Statement Actuals worker failed during execution [jobId=${job.id}]`, error, {
        action: "WORKER_IS_ACTUALS_FAILED",
        entityName: "IncomeStatementActuals",
        jobId: String(job.id),
        queueName: QueueNames.SyncIncomeStatementActuals,
        companyId: job.data?.companyId,
        contextJson: { fiscalYear: job.data?.fiscalYear }
      });
      throw error;
    }
  },
  {
    concurrency: Number(process.env.SYNC_INCOME_STATEMENT_ACTUALS_CONCURRENCY ?? 1),
  }
);

syncIncomeStatementActualsWorker.on("failed", async (job, error) => {
  await logger.error(`Income Statement Actuals sync job failed event [jobId=${job?.id}]`, error, {
    action: "WORKER_IS_ACTUALS_ON_FAILED",
    entityName: "IncomeStatementActuals",
    jobId: String(job?.id),
    queueName: QueueNames.SyncIncomeStatementActuals,
    companyId: job?.data?.companyId
  });
});