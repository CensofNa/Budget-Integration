import "dotenv/config";

import {
  PgBossWorker as Worker,
  QueueNames
} from "@budget-integration/integration-core";

import {
  processIncomeStatementPropertyJob } from "../jobs/process-income-statement-property.job.js";

export const processIncomeStatementPropertyWorker = new Worker(
  QueueNames.ProcessIncomeStatementProperty,
  async (job) => {
    if (job.name !== "process-income-statement-property") {
      console.warn("[WARN] Unknown ProcessIncomeStatementProperty job name.", {
        jobId: job.id,
        jobName: job.name,
      });

      return null;
    }

    return processIncomeStatementPropertyJob(job.data);
  },
  {
    concurrency: Number(process.env.PROCESS_INCOME_STATEMENT_PROPERTY_CONCURRENCY ?? 2),
  }
);

processIncomeStatementPropertyWorker.on("failed", (job, error) => {
  console.error("[ERROR] ProcessIncomeStatementProperty job failed.", {
    jobId: job?.id,
    name: job?.name,
    data: job?.data,
    error: error.message,
    stack: error.stack,
  });
});

console.log("Process Income Statement Property processor loaded.");
