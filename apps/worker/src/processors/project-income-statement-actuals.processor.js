import { PgBossWorker as Worker, QueueNames } from "@budget-integration/integration-core";
import { projectIncomeStatementActualsJob } from "../jobs/project-income-statement-actuals.job.js";
// export const projectIncomeStatementActualsWorker = new Worker(
//   QueueNames.ProjectIncomeStatementActuals,
//   async (job) => {
//     if (job.name !== "project-income-statement-actuals") {
//       console.warn("[WARN] Unknown ProjectIncomeStatementActuals job name.", {
//         jobId: job.id,
//         jobName: job.name,
//       });
//       return null;
//     }
//     return projectIncomeStatementActualsJob(job.data);
//   },
//   { concurrency: Number(process.env.PROJECT_INCOME_STATEMENT_ACTUALS_CONCURRENCY ?? 1) }
// );
console.log("Project Income Statement Actuals processor loaded.");
//# sourceMappingURL=project-income-statement-actuals.processor.js.map