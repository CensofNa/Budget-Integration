import {
  PgBossWorker as Worker,
  QueueNames
} from "@budget-integration/integration-core";

import { stageIncomeStatementActualsJob } from "../jobs/stage-income-statement-actuals.job.js";

// export const stageIncomeStatementActualsWorker = new Worker(
//   QueueNames.StageIncomeStatementActuals,
//   async (job) => {
//     if (job.name !== "stage-income-statement-actuals") {
//       console.warn("[WARN] Unknown StageIncomeStatementActuals job name.", {
//         jobId: job.id,
//         jobName: job.name,
//       });
//       return null;
//     }
//     return stageIncomeStatementActualsJob(job.data);
//   },
//   { concurrency: Number(process.env.STAGE_INCOME_STATEMENT_ACTUALS_CONCURRENCY ?? 2) }
// );

console.log("Stage Income Statement Actuals processor loaded.");