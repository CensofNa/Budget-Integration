import "dotenv/config";
import { PgBossWorker as Worker, QueueNames } from "@budget-integration/integration-core";
import { syncEntrataIncomeStatementActualsJob } from "../jobs/sync-entrata-income-statement-actuals.job.js";
export const syncIncomeStatementActualsWorker = new Worker(QueueNames.SyncIncomeStatementActuals, async (job) => {
    if (job.name !== "sync-income-statement-actuals") {
        console.warn("[WARN] Unknown SyncIncomeStatementActuals job name.", {
            jobId: job.id,
            jobName: job.name,
        });
        return null;
    }
    return syncEntrataIncomeStatementActualsJob(job.data);
}, {
    concurrency: Number(process.env.SYNC_INCOME_STATEMENT_ACTUALS_CONCURRENCY ?? 1),
});
syncIncomeStatementActualsWorker.on("failed", (job, error) => {
    console.error("[ERROR] IncomeStatementActuals sync job failed.", {
        jobId: job?.id,
        name: job?.name,
        data: job?.data,
        error: error.message,
        stack: error.stack,
    });
});
console.log("Sync Income Statement Actuals processor loaded.");
//# sourceMappingURL=sync-income-statement-actuals.processor.js.map