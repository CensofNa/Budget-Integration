import { prisma } from "@budget-integration/database";
import { PgBossWorker as Worker, QueueNames, acquireSyncLock } from "@budget-integration/integration-core";
import { projectBudgetActualSnapshotsJob } from "../jobs/project-budget-actual-snapshots.job.js";
export const projectBudgetActualSnapshotsWorker = new Worker(QueueNames.ProjectBudgetActualSnapshots, async (job) => {
    console.log("[INFO] ProjectBudgetActualSnapshots worker received job:", {
        jobId: job.id,
        name: job.name,
        data: job.data
    });
    if (job.name !== "project-budget-actual-snapshots") {
        console.warn("[WARN] Unknown ProjectBudgetActualSnapshots job ignored.", {
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
            entityName: `BudgetActualSnapshot:${job.data.propertyId}:${job.data.fiscalYear}`,
            ttlMs: 15 * 60 * 1000
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
        const result = await projectBudgetActualSnapshotsJob({
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            syncRunId: job.data.syncRunId ?? null,
            propertyId: job.data.propertyId,
            fiscalYear: job.data.fiscalYear
        });
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
    }
    catch (error) {
        console.error("[ERROR] ProjectBudgetActualSnapshots processor failed.", {
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
    concurrency: 1
});
projectBudgetActualSnapshotsWorker.on("failed", async (job, error) => {
    if (!job) {
        return;
    }
    console.error("[ERROR] ProjectBudgetActualSnapshots job failed.", {
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
//# sourceMappingURL=project-budget-actual-snapshots.processor.js.map