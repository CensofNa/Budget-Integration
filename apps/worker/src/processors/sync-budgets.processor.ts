import {
  Prisma } from "@prisma/client";


import {
  prisma } from "@budget-integration/database";
import {
  PgBossWorker as Worker,
  acquireSyncLock
} from "@budget-integration/integration-core";

import {
  QueueNames,
  transformBudgetStagingQueue,
  IntegrationError,
  type SyncBudgetJobData
} from "@budget-integration/integration-core";

import {
  syncEntrataBudgetsJob } from "../jobs/sync-entrata-budgets.job.js";

export const syncBudgetsWorker = new Worker<SyncBudgetJobData>(
  QueueNames.SyncBudget,
  async (job) => {
    console.log(`SyncBudget worker received job: ${job.name}`, job.data);

    if (job.name !== "sync-entrata-budgets") {
      return;
    }

    if (!job.data.fiscalYears) {
      throw new Error("Fiscal years are required to sync budgets");
    }

    await prisma.integrationQueueJob.updateMany({
      where: {
        bullJobId: String(job.id)
      },
      data: {
        status: "ACTIVE",
        startedAt: new Date()
      }
    });

    let lock: Awaited<ReturnType<typeof acquireSyncLock>> | null = null;

    try {
      lock = await acquireSyncLock({
        companyId: job.data.companyId,
        organisationId: job.data.organisationId,
        integrationSourceId: job.data.integrationSourceId,
        entityName: job.data.entityName,
        ttlMs: 30 * 60 * 1000
      });

      const result = await syncEntrataBudgetsJob({
        companyId: job.data.companyId,
        organisationId: job.data.organisationId,
        integrationSourceId: job.data.integrationSourceId,
        fiscalYears: job.data.fiscalYears,
        budgetIds: job.data.budgetIds || "",
        budgetStatusTypeIds: job.data.budgetStatusTypeIds || "",
        ...(job.data.propertyIds
          ? { propertyIds: job.data.propertyIds }
          : job.data.propertyId
            ? { propertyId: job.data.propertyId }
            : {}),
        updateFiscalConfig: job.data.updateFiscalConfig ?? false
      });

      console.log("Budget sync result:", result);

      if (result && (result.recordsPendingTransform > 0 || result.recordsStaged > 0)) {
        const queueRecord = await prisma.integrationQueueJob.create({
          data: {
            companyId: result.companyId,
            organisationId: result.organisationId,
            integrationSourceId: result.integrationSourceId,
            syncRunId: result.syncRunId,
            queueName: QueueNames.TransformBudgetStaging,
            jobName: "transform-budget-staging",
            entityName: "Budget",
            status: "QUEUED",
            payloadJson: {
              companyId: result.companyId,
              organisationId: result.organisationId,
              integrationSourceId: result.integrationSourceId,
              syncRunId: result.syncRunId,
              entityName: "Budget"
            } as Prisma.InputJsonValue
          }
        });

        const transformJob = await transformBudgetStagingQueue.add(
          "transform-budget-staging",
          {
            companyId: result.companyId,
            organisationId: result.organisationId,
            integrationSourceId: result.integrationSourceId,
            syncRunId: result.syncRunId,
            entityName: "Budget"
          },
          {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000
          }
        );

        await prisma.integrationQueueJob.update({
          where: {
            id: queueRecord.id
          },
          data: {
            bullJobId: String(transformJob.id)
          }
        });
      }

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
    } catch (error) {
      console.error("Budget sync processor error:", error);

      await prisma.integrationQueueJob.updateMany({
        where: {
          bullJobId: String(job.id)
        },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date()
        }
      });

      throw error;
    } finally {
      if (lock) {
        await lock.release().catch((releaseError) => {
          console.warn("Failed to release Budget sync lock:", releaseError);
        });
      }
    }
  },
  {
    concurrency: 1
  }
);