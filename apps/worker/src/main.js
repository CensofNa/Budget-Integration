import "dotenv/config";
import { prisma } from "@budget-integration/database";
import * as readline from "readline";
import { releaseActiveSyncLocks, startPgBoss } from "@budget-integration/integration-core";
import { cloneDemoPropertyJob } from "./jobs/clone-demo-property.job.js";
import { transformStagedPropertiesJob } from "./jobs/transform-staged-properties.job.js";
import { registerEntrataPropertySchedulers } from "./schedulers/entrata-property.scheduler.js";
import { registerEntrataPropertyUnitSchedulers } from "./schedulers/entrata-property-unit.scheduler.js";
import { registerEntrataUnitTypeSchedulers } from "./schedulers/entrata-unit-type.scheduler.js";
import { registerEntrataBudgetSchedulers } from "./schedulers/entrata-budget.scheduler.js";
import { registerEntrataReportDataSchedulers } from "./schedulers/entrata-report-data.scheduler.js";
import { registerEntrataGlTreeSchedulers } from "./schedulers/entrata-gl-tree.scheduler.js";
import { registerEntrataBudgetActualSchedulers } from "./schedulers/entrata-budget-actual.scheduler.js";
import { resetReportSyncState } from "./helpers/reset-report-sync-state.js";
// Importing the queues here is safe. These imports only create queue handles.
// The actual BullMQ workers are started only when the processor files are imported
// in loadProcessorsForMode().
import { syncPropertyQueue, syncPropertyUnitQueue, syncUnitTypeQueue, syncBudgetQueue, syncReportDataQueue, syncGlTreeQueue, syncBudgetActualQueue, transformBudgetActualStagingQueue, projectBudgetActualSnapshotsQueue } from "@budget-integration/integration-core";
const workerModes = [
    "ALL",
    "INCOME_STATEMENT_ONLY",
    "BUDGET_REPORT_ONLY",
    "REPORT_ONLY",
    "BUDGET_ACTUAL_ONLY",
    "BUDGET_ONLY",
    "PROPERTY_ONLY",
    "PROPERTY_UNIT_ONLY",
    "UNIT_TYPE_ONLY",
    "GL_TREE_ONLY",
    "NONE",
];
function askQuestion(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}
async function askConfirmation(question) {
    const answer = await askQuestion(question);
    return answer.toLowerCase() === "yes" || answer.toLowerCase() === "y";
}
async function askWorkerMode() {
    // Optional override still supported for automated runs/PM2/docker.
    // For local manual runs, leave WORKER_MODE empty and choose from console.
    const envMode = process.env.WORKER_MODE?.trim().toUpperCase();
    if (envMode && workerModes.includes(envMode)) {
        return envMode;
    }
    console.log("\nSelect worker module to run:");
    workerModes.forEach((mode, index) => {
        console.log(`  ${index + 1}. ${mode}`);
    });
    const answer = await askQuestion("\nWorker module [default: REPORT_ONLY]: ");
    if (!answer) {
        return "REPORT_ONLY";
    }
    const numberValue = Number(answer);
    if (Number.isInteger(numberValue) && numberValue >= 1 && numberValue <= workerModes.length) {
        return workerModes[numberValue - 1] || "REPORT_ONLY";
    }
    const modeValue = answer.toUpperCase();
    if (workerModes.includes(modeValue)) {
        return modeValue;
    }
    console.warn(`Invalid worker module '${answer}'. Defaulting to REPORT_ONLY.`);
    return "REPORT_ONLY";
}
async function loadProcessorsForMode(workerMode) {
    console.log("Worker mode:", workerMode);
    if (workerMode === "INCOME_STATEMENT_ONLY") {
        await import("./processors/sync-income-statement-actuals.processor.js");
        await import("./processors/stage-income-statement-actuals.processor.js");
        await import("./processors/transform-income-statement-actuals.processor.js");
        await import("./processors/project-income-statement-actuals.processor.js");
        await import("./processors/process-income-statement-property.processor.js");
        return;
    }
    if (workerMode === "BUDGET_REPORT_ONLY") {
        console.log("Budget Report pipeline worker mode active.");
        return;
    }
    if (workerMode === "REPORT_ONLY") {
        await import("./processors/sync-report-data.processor.js");
        await import("./processors/transform-report-data-staging.processor.js");
        await import("./processors/project-occupancy-from-reports.processor.js");
        return;
    }
    if (workerMode === "BUDGET_ACTUAL_ONLY") {
        await import("./processors/sync-budget-actuals.processor.js");
        await import("./processors/transform-budget-actual-staging.processor.js");
        await import("./processors/project-budget-actual-snapshots.processor.js");
        return;
    }
    if (workerMode === "BUDGET_ONLY") {
        await import("./processors/sync-budgets.processor.js");
        await import("./processors/transform-budget-staging.processor.js");
        return;
    }
    if (workerMode === "PROPERTY_ONLY") {
        await import("./processors/sync-property.processor.js");
        await import("./processors/transform-property-staging.processor.js");
        return;
    }
    if (workerMode === "PROPERTY_UNIT_ONLY") {
        await import("./processors/sync-property-units.processor.js");
        await import("./processors/transform-property-unit-staging.processor.js");
        return;
    }
    if (workerMode === "UNIT_TYPE_ONLY") {
        await import("./processors/sync-unit-types.processor.js");
        await import("./processors/transform-unit-type-staging.processor.js");
        return;
    }
    if (workerMode === "GL_TREE_ONLY") {
        await import("./processors/sync-gl-trees.processor.js");
        await import("./processors/transform-gl-tree-staging.processor.js");
        return;
    }
    // ALL mode: use this only when you intentionally want the worker to process
    // every queue that already has waiting/delayed/retry jobs in Redis.
    await import("./processors/sync-property.processor.js");
    await import("./processors/transform-property-staging.processor.js");
    await import("./processors/sync-property-units.processor.js");
    await import("./processors/transform-property-unit-staging.processor.js");
    await import("./processors/sync-unit-types.processor.js");
    await import("./processors/transform-unit-type-staging.processor.js");
    await import("./processors/sync-budgets.processor.js");
    await import("./processors/transform-budget-staging.processor.js");
    await import("./processors/sync-report-data.processor.js");
    await import("./processors/transform-report-data-staging.processor.js");
    await import("./processors/project-occupancy-from-reports.processor.js");
    await import("./processors/sync-gl-trees.processor.js");
    await import("./processors/transform-gl-tree-staging.processor.js");
    await import("./processors/sync-budget-actuals.processor.js");
    await import("./processors/transform-budget-actual-staging.processor.js");
    await import("./processors/project-budget-actual-snapshots.processor.js");
    await import("./processors/sync-income-statement-actuals.processor.js");
    await import("./processors/stage-income-statement-actuals.processor.js");
    await import("./processors/transform-income-statement-actuals.processor.js");
    await import("./processors/project-income-statement-actuals.processor.js");
    await import("./processors/process-income-statement-property.processor.js");
}
async function shutdown(signal) {
    console.log(`${signal} received, releasing sync locks...`);
    await releaseActiveSyncLocks();
    process.exit(0);
}
// async function enqueueBudgetActualTransformForSyncRun(syncRunId: string) {
//   const companyId = "b9a26559-9837-4215-95e9-f5ffd0a9fb5c";
//   const organisationId = "38bc82c3-a017-49fc-a441-0c75994527dd";
//   const integrationSourceId = "00005001-2f79-ff92-71d4-43aa25eac701";
//   console.log("[INFO] Searching pending BudgetActual staging rows.", {
//     syncRunId,
//   });
//   const pendingGroups = await prisma.stagingBudgetActual.groupBy({
//     by: ["syncRunId", "stagingBatchId"],
//     where: {
//       companyId,
//       organisationId,
//       integrationSourceId,
//       syncRunId,
//       transformStatus: "PENDING",
//     },
//     _count: {
//       id: true,
//     },
//     orderBy: [
//       {
//         stagingBatchId: "asc",
//       },
//     ],
//   });
//   if (pendingGroups.length === 0) {
//     console.log("[INFO] No pending BudgetActual staging rows found.", {
//       syncRunId,
//     });
//     return;
//   }
//   console.log("[INFO] Pending BudgetActual staging batches found.", {
//     syncRunId,
//     batchCount: pendingGroups.length,
//     totalRows: pendingGroups.reduce((sum, group) => sum + group._count.id, 0),
//   });
//   const enqueueResults: Array<{
//     syncRunId: string;
//     stagingBatchId: string | null;
//     status: "QUEUED" | "FAILED";
//     bullJobId?: string;
//     pendingRows: number;
//     error?: string;
//   }> = [];
//   for (const group of pendingGroups) {
//     try {
//       if (!group.syncRunId) {
//         throw new Error("syncRunId is missing in pending group");
//       }
//       if (!group.stagingBatchId) {
//         throw new Error("stagingBatchId is missing in pending group");
//       }
//       const jobId = `transform-budget-actual:${group.syncRunId}:${group.stagingBatchId}`;
//       const job = await transformBudgetActualStagingQueue.add(
//         "transform-budget-actual-staging",
//         {
//           companyId,
//           organisationId,
//           integrationSourceId,
//           entityName: "BudgetActual",
//           syncRunId: group.syncRunId,
//           stagingBatchId: group.stagingBatchId,
//         },
//         {
//           attempts: 3,
//           backoff: {
//             type: "exponential",
//             delay: 5000,
//           },
//           removeOnComplete: 100,
//           removeOnFail: 1000,
//           jobId,
//         }
//       );
//       enqueueResults.push({
//         syncRunId: group.syncRunId,
//         stagingBatchId: group.stagingBatchId,
//         status: "QUEUED",
//         bullJobId: String(job.id),
//         pendingRows: group._count.id,
//       });
//       console.log("[INFO] Queued BudgetActual transform job.", {
//         bullJobId: job.id,
//         jobId,
//         syncRunId: group.syncRunId,
//         stagingBatchId: group.stagingBatchId,
//         pendingRows: group._count.id,
//       });
//     } catch (error) {
//       const errorMessage =
//         error instanceof Error ? error.message : JSON.stringify(error);
//       enqueueResults.push({
//         syncRunId: group.syncRunId,
//         stagingBatchId: group.stagingBatchId,
//         status: "FAILED",
//         pendingRows: group._count.id,
//         error: errorMessage,
//       });
//       console.error("[ERROR] Failed to queue BudgetActual transform job.", {
//         syncRunId: group.syncRunId,
//         stagingBatchId: group.stagingBatchId,
//         pendingRows: group._count.id,
//         error: errorMessage,
//       });
//       /*
//         Do not throw here.
//         Continue queueing remaining staging batches.
//       */
//     }
//   }
//   const queuedCount = enqueueResults.filter((r) => r.status === "QUEUED").length;
//   const failedCount = enqueueResults.filter((r) => r.status === "FAILED").length;
//   console.log("[INFO] Finished queueing BudgetActual transform jobs.", {
//     syncRunId,
//     totalBatches: enqueueResults.length,
//     queuedCount,
//     failedCount,
//   });
//   if (failedCount > 0) {
//     console.warn("[WARN] Some BudgetActual transform jobs failed to queue.", {
//       syncRunId,
//       failedBatches: enqueueResults.filter((r) => r.status === "FAILED"),
//     });
//   }
// }
// async function main() {
//   console.log("BudgetActual transform-only runner started");
//   const syncRunId = 'dcef66ff-4014-4d8f-afaa-ce0fe21fa7a1';
//   if (!syncRunId) {
//     throw new Error("BUDGET_ACTUAL_SYNC_RUN_ID is required");
//   }
//   await import("./processors/transform-budget-actual-staging.processor.js");
//   await enqueueBudgetActualTransformForSyncRun(syncRunId);
//   console.log("[INFO] Jobs queued. Keep this process running until transform completes.");
// }
// main().catch((error) => {
//   console.error("[ERROR] BudgetActual transform-only runner failed:", error);
//   process.exit(1);
// });
async function main() {
    console.log("Budget Integration Worker started");
    console.log("DATABASE_URL from env:", process.env.DATABASE_URL);
    try {
        const result = await prisma.$queryRaw `SELECT current_database() as database_name`;
        if (result[0]) {
            console.log("Connected to database:", result[0].database_name);
        }
    }
    catch (error) {
        console.error("Failed to get database info:", error);
    }
    console.log("Initializing pg-boss job queue...");
    await startPgBoss();
    console.log("pg-boss initialized successfully!");
    // Choose the worker module before importing processors.
    // This prevents unrelated queues such as BudgetActual from starting during report-only testing.
    const workerMode = await askWorkerMode();
    await loadProcessorsForMode(workerMode);
    // Scheduler registration is intentionally left commented during manual testing.
    // If enabled, schedulers can enqueue jobs even when you only wanted a manual run.
    // await registerEntrataPropertySchedulers();
    // await registerEntrataPropertyUnitSchedulers();
    // await registerEntrataUnitTypeSchedulers();
    // await registerEntrataBudgetSchedulers();
    // await registerEntrataReportDataSchedulers();
    // await registerEntrataGlTreeSchedulers();
    // await registerEntrataBudgetActualSchedulers();
    const variables = {
        companyId: "b9a26559-9837-4215-95e9-f5ffd0a9fb5c",
        organisationId: "38bc82c3-a017-49fc-a441-0c75994527dd",
    };
    const ids = {
        entrataSourceId: "00005001-2f79-ff92-71d4-43aa25eac701",
        yardiSourceId: "00005001-a252-7a80-d64a-7d7a15ac9702",
        excelSourceId: "00005001-0f4c-2974-f0c4-a199c110b703",
    };
    const proceed = await askConfirmation("\nProceed with sync? (yes/no): ");
    if (!proceed) {
        console.log("Operation cancelled.");
        await shutdown("CANCEL");
    }
    // await cloneDemoPropertyJob({
    //   companyId: variables.companyId,
    //   organisationId: variables.organisationId,
    //   integrationSourceId: ids.entrataSourceId,
    //   sourcePropertyCode: "100013236",
    //   targetPropertyCode: "200010000",
    //   demoPropertyName: "Demo Property - 200010000"
    // });
    // await syncPropertyQueue.add("sync-entrata-property", {
    //   companyId: variables.companyId,
    //   organisationId: variables.organisationId,
    //   integrationSourceId: ids.entrataSourceId,
    //   entityName: "Property",
    //   propertyId: "100108623"
    // });
    // await syncPropertyUnitQueue.add("sync-entrata-property-units", {
    //   companyId: variables.companyId,
    //   organisationId: variables.organisationId,
    //   integrationSourceId: ids.entrataSourceId,
    //   entityName: "PropertyUnit",
    //   propertyId: "100108623"
    // });
    // await syncUnitTypeQueue.add("sync-entrata-unit-types", {
    //   companyId: variables.companyId,
    //   organisationId: variables.organisationId,
    //   integrationSourceId: ids.entrataSourceId,
    //   entityName: "UnitType",
    //   propertyId: "100108623"
    // });
    // await syncBudgetQueue.add("sync-entrata-budgets", {
    //   companyId: variables.companyId,
    //   organisationId: variables.organisationId,
    //   integrationSourceId: ids.entrataSourceId,
    //   entityName: "Budget",
    //   fiscalYears: "2025",
    //   budgetIds: "",
    //   budgetStatusTypeIds: "",
    //   // propertyId: "100108623"
    // });
    // const shouldResetReportState = await askQuestion(
    //   "Reset pending report queue/cache before starting sync? (yes/no): "
    // );
    // if (shouldResetReportState.trim().toLowerCase() === "yes" || shouldResetReportState.trim().toLowerCase() === "y") {
    //   await syncReportDataQueue.add("sync-entrata-report-data", {
    //     companyId: variables.companyId,
    //     organisationId: variables.organisationId,
    //     integrationSourceId: ids.entrataSourceId,
    //     entityName: "ReportData",
    //     reportCode: "box_score",
    //     // propertyIds: ["100013236"],
    //     fiscalYear: 2026,
    //     includePriorYear: false,
    //   });
    // }
    // if (shouldResetReportState.trim().toLowerCase() === "yes" || shouldResetReportState.trim().toLowerCase() === "y") {
    //   await syncReportDataQueue.add("sync-entrata-report-data", {
    //     companyId: variables.companyId,
    //     organisationId: variables.organisationId,
    //     integrationSourceId: ids.entrataSourceId,
    //     entityName: "ReportData",
    //     reportCode: "resident_retention",
    //     // propertyIds: ["100013236"],
    //     fiscalYear: 2026,
    //     includePriorYear: false
    //   });
    // }
    // const job = await syncGlTreeQueue.add("sync-entrata-gl-trees", {
    //   companyId: variables.companyId,
    //   organisationId: variables.organisationId,
    //   integrationSourceId: ids.entrataSourceId,
    //   entityName: "GlTree"
    // });
    // await syncBudgetActualQueue.add("sync-entrata-budget-actuals", {
    //   companyId: variables.companyId,
    //   organisationId: variables.organisationId,
    //   integrationSourceId: ids.entrataSourceId,
    //   entityName: "BudgetActual",
    //   accountingMethod: "Accrual",
    //   propertyId: "100061024",
    //   budgetStatusTypeIds: "1",
    //   startPostMonth: "06/2026",
    //   endPostMonth: "06/2026",
    // });
    console.log("Worker processors loaded and listening. Press Ctrl+C to stop.");
}
// async function main() {
//   console.log("BudgetActual projection-only runner started");
//   const syncRunId = 'dcef66ff-4014-4d8f-afaa-ce0fe21fa7a1' ;
//   if (!syncRunId) {
//     throw new Error("BUDGET_ACTUAL_SYNC_RUN_ID is required");
//   }
//   await import("./processors/project-budget-actual-snapshots.processor.js");
//   await enqueueBudgetActualProjectionForSyncRun(syncRunId);
//   console.log("[INFO] Projection jobs queued. Keep this process running until projection completes.");
// }
// main().catch((error) => {
//   console.error("[ERROR] BudgetActual projection-only runner failed:", error);
//   process.exit(1);
// });
async function enqueueBudgetActualProjectionForSyncRun(syncRunId) {
    const companyId = "b9a26559-9837-4215-95e9-f5ffd0a9fb5c";
    const organisationId = "38bc82c3-a017-49fc-a441-0c75994527dd";
    const integrationSourceId = "00005001-2f79-ff92-71d4-43aa25eac701";
    console.log("[INFO] Searching transformed BudgetActual staging rows for projection.", {
        syncRunId,
    });
    const stagedGroups = await prisma.stagingBudgetActual.findMany({
        where: {
            companyId,
            organisationId,
            integrationSourceId,
            syncRunId,
            transformStatus: "TRANSFORMED",
        },
        select: {
            sourcePropertyId: true,
            fiscalYear: true,
        },
        distinct: ["sourcePropertyId", "fiscalYear"],
        orderBy: [
            {
                sourcePropertyId: "asc",
            },
            {
                fiscalYear: "asc",
            },
        ],
    });
    const propertyFiscalYearPairs = stagedGroups.filter((group) => !!group.sourcePropertyId && !!group.fiscalYear);
    if (propertyFiscalYearPairs.length === 0) {
        console.log("[INFO] No transformed BudgetActual staging rows found for projection.", {
            syncRunId,
        });
        return;
    }
    const sourcePropertyIds = Array.from(new Set(propertyFiscalYearPairs.map((pair) => pair.sourcePropertyId)));
    const propertyMaps = await prisma.sourceRecordMap.findMany({
        where: {
            companyId,
            organisationId,
            integrationSourceId,
            entityName: "Property",
            canonicalTableName: "properties",
            sourceRecordId: {
                in: sourcePropertyIds,
            },
            matchStatus: {
                in: ["AUTO_MATCHED", "MANUAL_MATCHED"],
            },
        },
        select: {
            sourceRecordId: true,
            canonicalRecordId: true,
        },
    });
    const propertyIdBySourceId = new Map(propertyMaps.map((map) => [map.sourceRecordId, map.canonicalRecordId]));
    const enqueueResults = [];
    for (const pair of propertyFiscalYearPairs) {
        try {
            const propertyId = propertyIdBySourceId.get(pair.sourcePropertyId);
            if (!propertyId) {
                const message = "No canonical property mapping found.";
                console.warn("[WARN] Skipping BudgetActual projection enqueue.", {
                    syncRunId,
                    sourcePropertyId: pair.sourcePropertyId,
                    fiscalYear: pair.fiscalYear,
                    reason: message,
                });
                enqueueResults.push({
                    sourcePropertyId: pair.sourcePropertyId,
                    fiscalYear: pair.fiscalYear,
                    status: "SKIPPED",
                    error: message,
                });
                continue;
            }
            const jobId = `project-budget-actual_${syncRunId}_${propertyId}_${pair.fiscalYear}_${Date.now()}`;
            const job = await projectBudgetActualSnapshotsQueue.add("project-budget-actual-snapshots", {
                companyId,
                organisationId,
                integrationSourceId,
                entityName: "BudgetActual",
                syncRunId,
                propertyId,
                fiscalYear: pair.fiscalYear,
            }, {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000,
                },
                removeOnComplete: 100,
                removeOnFail: 1000,
                jobId,
            });
            enqueueResults.push({
                sourcePropertyId: pair.sourcePropertyId,
                propertyId,
                fiscalYear: pair.fiscalYear,
                status: "QUEUED",
                bullJobId: String(job.id),
            });
            console.log("[INFO] Queued BudgetActual projection job.", {
                bullJobId: job.id,
                jobId,
                syncRunId,
                sourcePropertyId: pair.sourcePropertyId,
                propertyId,
                fiscalYear: pair.fiscalYear,
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            enqueueResults.push({
                sourcePropertyId: pair.sourcePropertyId,
                fiscalYear: pair.fiscalYear,
                status: "FAILED",
                error: errorMessage,
            });
            console.error("[ERROR] Failed to queue BudgetActual projection job.", {
                syncRunId,
                sourcePropertyId: pair.sourcePropertyId,
                fiscalYear: pair.fiscalYear,
                error: errorMessage,
            });
            // Continue with remaining property/year pairs.
        }
    }
    const queuedCount = enqueueResults.filter((r) => r.status === "QUEUED").length;
    const skippedCount = enqueueResults.filter((r) => r.status === "SKIPPED").length;
    const failedCount = enqueueResults.filter((r) => r.status === "FAILED").length;
    console.log("[INFO] Finished queueing BudgetActual projection jobs.", {
        syncRunId,
        totalPairs: enqueueResults.length,
        queuedCount,
        skippedCount,
        failedCount,
    });
    if (failedCount > 0 || skippedCount > 0) {
        console.warn("[WARN] Some BudgetActual projection jobs were not queued.", {
            syncRunId,
            skippedOrFailed: enqueueResults.filter((r) => r.status === "SKIPPED" || r.status === "FAILED"),
        });
    }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=main.js.map