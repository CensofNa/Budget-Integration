import { PgBossWorker as Worker, QueueNames } from "@budget-integration/integration-core";
import { transformIncomeStatementActualsJob } from "../jobs/transform-income-statement-actuals.job.js";
// export const transformIncomeStatementActualsWorker = new Worker(
//   QueueNames.TransformIncomeStatementActuals,
//   async (job) => {
//     if (job.name !== "transform-income-statement-actuals") {
//       console.warn("[WARN] Unknown TransformIncomeStatementActuals job name.", {
//         jobId: job.id,
//         jobName: job.name,
//       });
//       return null;
//     }
//     return transformIncomeStatementActualsJob(job.data);
//   },
//   { concurrency: Number(process.env.TRANSFORM_INCOME_STATEMENT_ACTUALS_CONCURRENCY ?? 1) }
// );
console.log("Transform Income Statement Actuals processor loaded.");
//# sourceMappingURL=transform-income-statement-actuals.processor.js.map