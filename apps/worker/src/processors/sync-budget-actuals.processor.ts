import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";

import {
  PgBossWorker as Worker,
  QueueNames,
  syncBudgetActualQueue,
  transformBudgetActualStagingQueue,
  type SyncBudgetActualJobData,
  acquireSyncLock,
  createLogger
} from "@budget-integration/integration-core";

import { syncEntrataBudgetActualsJob } from "../jobs/sync-entrata-budget-actuals.job.js";

const logger = createLogger("budget-service", prisma);

export const syncBudgetActualsWorker =
  new Worker<SyncBudgetActualJobData>(
    QueueNames.SyncBudgetActual,
    async (job) => {
      await logger.info(`SyncBudgetActual worker received job [jobId=${job.id}]`, {
        action: "WORKER_BUDGET_ACTUAL_RECEIVED",
        entityName: "BudgetActual",
        jobId: String(job.id),
        queueName: QueueNames.SyncBudgetActual,
        companyId: job.data.companyId,
        organisationId: job.data.organisationId,
        integrationSourceId: job.data.integrationSourceId,
        contextJson: {
          propertyId: job.data.propertyId,
          startPostMonth: job.data.startPostMonth,
          endPostMonth: job.data.endPostMonth
        }
      });

      if (job.name !== "sync-entrata-budget-actuals") {
        await logger.warn(`Unknown SyncBudgetActual job ignored [jobName=${job.name}]`, {
          action: "WORKER_BUDGET_ACTUAL_IGNORED",
          entityName: "BudgetActual",
          jobId: String(job.id)
        });
        return null;
      }

      let lock: Awaited<ReturnType<typeof acquireSyncLock>> | null = null;

      try {
        lock = await acquireSyncLock({
          companyId: job.data.companyId,
          organisationId: job.data.organisationId,
          integrationSourceId: job.data.integrationSourceId,
          entityName: "BudgetActual",
          ttlMs: 60 * 60 * 1000
        });

        await prisma.integrationQueueJob.updateMany({
          where: { bullJobId: String(job.id) },
          data: { status: "ACTIVE", startedAt: new Date() }
        });

        const result = await syncEntrataBudgetActualsJob({
          entityName: "BudgetActual",
          companyId: job.data.companyId,
          organisationId: job.data.organisationId,
          integrationSourceId: job.data.integrationSourceId,
          accountingMethod: job.data.accountingMethod ?? "Accrual",
          budgetStatusTypeIds: job.data.budgetStatusTypeIds ?? "1",
          ...(job.data.propertyId ? { propertyId: job.data.propertyId } : {}),
          ...(job.data.budgetIds ? { budgetIds: job.data.budgetIds } : {}),
          ...(job.data.startPostMonth ? { startPostMonth: job.data.startPostMonth } : {}),
          ...(job.data.endPostMonth ? { endPostMonth: job.data.endPostMonth } : {})
        });

        if (result && result.recordsStaged > 0) {
          const queueRecord = await prisma.integrationQueueJob.create({
            data: {
              companyId: result.companyId,
              organisationId: result.organisationId,
              integrationSourceId: result.integrationSourceId,
              syncRunId: result.syncRunId,
              entityName: "BudgetActual",
              queueName: "transform-budget-actual-staging",
              jobName: "transform-budget-actual-staging",
              status: "QUEUED",
              payloadJson: {
                companyId: result.companyId,
                organisationId: result.organisationId,
                integrationSourceId: result.integrationSourceId,
                syncRunId: result.syncRunId,
                entityName: "BudgetActual"
              } as Prisma.InputJsonValue
            }
          });

          const transformJob = await transformBudgetActualStagingQueue.add(
            "transform-budget-actual-staging",
            {
              companyId: result.companyId,
              organisationId: result.organisationId,
              integrationSourceId: result.integrationSourceId,
              syncRunId: result.syncRunId,
              entityName: "BudgetActual"
            },
            {
              attempts: 3,
              backoff: { type: "exponential", delay: 5000 },
              removeOnComplete: 100,
              removeOnFail: 1000
            }
          );

          await prisma.integrationQueueJob.update({
            where: { id: queueRecord.id },
            data: { bullJobId: String(transformJob.id) }
          });

          await logger.info(`BudgetActual sync staged ${result.recordsStaged} records, queued transform job [jobId=${transformJob.id}]`, {
            action: "WORKER_BUDGET_ACTUAL_TRANSFORM_QUEUED",
            entityName: "BudgetActual",
            jobId: String(transformJob.id),
            syncRunId: result.syncRunId,
            companyId: result.companyId,
            contextJson: { recordsStaged: result.recordsStaged }
          });
        }

        await prisma.integrationQueueJob.updateMany({
          where: { bullJobId: String(job.id) },
          data: { status: "COMPLETED", completedAt: new Date() }
        });

        await logger.info(`BudgetActual sync worker finished successfully [syncRunId=${result?.syncRunId}]`, {
          action: "WORKER_BUDGET_ACTUAL_COMPLETED",
          entityName: "BudgetActual",
          jobId: String(job.id),
          syncRunId: result?.syncRunId,
          companyId: result?.companyId
        });

        return result;
      } catch (error) {
        await logger.error(`SyncBudgetActual processor failed [jobId=${job.id}]`, error, {
          action: "WORKER_BUDGET_ACTUAL_FAILED",
          entityName: "BudgetActual",
          jobId: String(job.id),
          companyId: job.data.companyId
        });

        await prisma.integrationQueueJob.updateMany({
          where: { bullJobId: String(job.id) },
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
      concurrency: 1,
      lockDuration: 30 * 60 * 1000,
      lockRenewTime: 5 * 60 * 1000,
      stalledInterval: 60 * 1000,
      maxStalledCount: 1
    }
  );

syncBudgetActualsWorker.on("failed", async (job, error) => {
  if (!job) return;

  await logger.error(`SyncBudgetActual job failed event [jobId=${job.id}]`, error, {
    action: "WORKER_BUDGET_ACTUAL_ON_FAILED",
    entityName: "BudgetActual",
    jobId: String(job.id),
    companyId: job.data?.companyId
  });

  await prisma.integrationQueueJob.updateMany({
    where: { bullJobId: String(job.id) },
    data: {
      status: "FAILED",
      errorMessage: error.message,
      completedAt: new Date()
    }
  });
});