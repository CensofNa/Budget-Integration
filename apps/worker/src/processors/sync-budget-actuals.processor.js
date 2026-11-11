import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { PgBossWorker as Worker, QueueNames, syncBudgetActualQueue, transformBudgetActualStagingQueue, acquireSyncLock } from "@budget-integration/integration-core";
import { syncEntrataBudgetActualsJob } from "../jobs/sync-entrata-budget-actuals.job.js";
export const syncBudgetActualsWorker = new Worker(QueueNames.SyncBudgetActual, async (job) => {
    console.log("[INFO] SyncBudgetActual worker received job:", {
        jobId: job.id,
        data: job.data
    });
    if (job.name !== "sync-entrata-budget-actuals") {
        console.warn("[WARN] Unknown SyncBudgetActual job ignored.", {
            jobId: job.id,
            jobName: job.name
        });
        return null;
    }
    let lock = null;
    try {
        lock = await acquireSyncLock({
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            entityName: "BudgetActual",
            ttlMs: 60 * 60 * 1000
        });
        await prisma.integrationQueueJob.updateMany({
            where: {
                bullJobId: String(job.id)
            },
            data: {
                status: "ACTIVE",
                startedAt: new Date()
            }
        });
        if (!job.data.budgetIds) {
            console.log("[INFO] No specific budgetIds provided, defaulting to all budgets for the company.");
            // return null;
        }
        // Get the current date
        const now = new Date();
        const curentMonth = now.getMonth() + 1; // getMonth() returns 0-11
        const currentYear = now.getFullYear();
        const currentMonthString = `${curentMonth.toString().padStart(2, "0")}/${currentYear}`;
        const result = await syncEntrataBudgetActualsJob({
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            entityName: "BudgetActual",
            accountingMethod: job.data.accountingMethod ?? "Accrual",
            fiscalYears: job.data.fiscalYears ?? now.getFullYear().toString(),
            budgetStatusTypeIds: job.data.budgetStatusTypeIds ?? "1",
            ...(job.data.budgetIds ? { budgetIds: job.data.budgetIds } : {}),
            ...(job.data.propertyId ? { propertyId: job.data.propertyId } : {}),
            ...(job.data.startPostMonth ? { startPostMonth: job.data.startPostMonth } : { startPostMonth: currentMonthString }),
            ...(job.data.endPostMonth ? { endPostMonth: job.data.endPostMonth } : { endPostMonth: currentMonthString })
        });
        if (result &&
            result.recordsPendingTransform > 0) {
            console.log("[INFO] Queueing BudgetActual transform job.", {
                syncRunId: result.syncRunId,
                pendingTransform: result.recordsPendingTransform
            });
            const queueRecord = await prisma.integrationQueueJob.create({
                data: {
                    companyId: result.companyId,
                    organisationId: result.organisationId,
                    integrationSourceId: result.integrationSourceId,
                    syncRunId: result.syncRunId,
                    queueName: QueueNames.TransformBudgetActualStaging,
                    jobName: "transform-budget-actual-staging",
                    entityName: "BudgetActual",
                    status: "QUEUED",
                    payloadJson: {
                        companyId: result.companyId,
                        organisationId: result.organisationId,
                        integrationSourceId: result.integrationSourceId,
                        syncRunId: result.syncRunId,
                        entityName: "BudgetActual"
                    }
                }
            });
            const transformJob = await transformBudgetActualStagingQueue.add("transform-budget-actual-staging", {
                companyId: result.companyId,
                organisationId: result.organisationId,
                integrationSourceId: result.integrationSourceId,
                syncRunId: result.syncRunId,
                entityName: "BudgetActual"
            }, {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000
                },
                removeOnComplete: 100,
                removeOnFail: 1000
            });
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
        console.log("[INFO] BudgetActual sync completed.", {
            jobId: job.id,
            result
        });
        return result;
    }
    catch (error) {
        console.error("[ERROR] SyncBudgetActual processor failed.", {
            jobId: job.id,
            error
        });
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
    }
    finally {
        if (lock) {
            await lock.release().catch(() => undefined);
        }
    }
}, {
    concurrency: 1,
    lockDuration: 30 * 60 * 1000,
    lockRenewTime: 5 * 60 * 1000,
    stalledInterval: 60 * 1000,
    maxStalledCount: 1
});
syncBudgetActualsWorker.on("failed", async (job, error) => {
    if (!job) {
        return;
    }
    console.error("[ERROR] SyncBudgetActual job failed.", {
        jobId: job.id,
        name: job.name,
        data: job.data,
        error: error.message,
        stack: error.stack
    });
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
});
//# sourceMappingURL=sync-budget-actuals.processor.js.map