import { releaseActiveSyncLocks, startPgBoss, stopPgBoss } from "@budget-integration/integration-core";

export type WorkerMode =
  | "ALL"
  | "PROPERTY_DOMAIN"
  | "BUDGET_DOMAIN"
  | "RENT_DETAILS_DOMAIN"
  | "INCOME_STATEMENT_ONLY"
  | "BUDGET_REPORT_ONLY"
  | "REPORT_ONLY"
  | "BUDGET_ACTUAL_ONLY"
  | "BUDGET_ONLY"
  | "PROPERTY_ONLY"
  | "PROPERTY_UNIT_ONLY"
  | "UNIT_TYPE_ONLY"
  | "GL_TREE_ONLY"
  | "NONE";

export const workerModes: WorkerMode[] = [
  "ALL",
  "PROPERTY_DOMAIN",
  "BUDGET_DOMAIN",
  "RENT_DETAILS_DOMAIN",
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

export async function loadProcessorsForMode(workerMode: WorkerMode): Promise<void> {
  console.log("Loading worker processors for mode:", workerMode);

  if (workerMode === "NONE") {
    return;
  }

  if (workerMode === "PROPERTY_DOMAIN") {
    await import("./processors/sync-property.processor.js");
    await import("./processors/transform-property-staging.processor.js");
    await import("./processors/sync-property-units.processor.js");
    await import("./processors/transform-property-unit-staging.processor.js");
    await import("./processors/sync-unit-types.processor.js");
    await import("./processors/transform-unit-type-staging.processor.js");
    await import("./processors/sync-gl-trees.processor.js");
    await import("./processors/transform-gl-tree-staging.processor.js");
    return;
  }

  if (workerMode === "BUDGET_DOMAIN") {
    await import("./processors/sync-budgets.processor.js");
    await import("./processors/transform-budget-staging.processor.js");
    await import("./processors/sync-budget-actuals.processor.js");
    await import("./processors/transform-budget-actual-staging.processor.js");
    await import("./processors/project-budget-actual-snapshots.processor.js");
    await import("./processors/sync-income-statement-actuals.processor.js");
    await import("./processors/stage-income-statement-actuals.processor.js");
    await import("./processors/transform-income-statement-actuals.processor.js");
    await import("./processors/project-income-statement-actuals.processor.js");
    await import("./processors/process-income-statement-property.processor.js");
    await import("./processors/sync-balance-sheet-actuals.processor.js");
    await import("./processors/stage-balance-sheet-actuals.processor.js");
    await import("./processors/transform-balance-sheet-actuals.processor.js");
    await import("./processors/project-balance-sheet-actuals.processor.js");
    await import("./processors/sync-report-data.processor.js");
    await import("./processors/transform-report-data-staging.processor.js");
    return;
  }

  if (workerMode === "RENT_DETAILS_DOMAIN") {
    await import("./processors/sync-report-data.processor.js");
    await import("./processors/transform-report-data-staging.processor.js");
    await import("./processors/project-occupancy-from-reports.processor.js");
    return;
  }

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

  // ALL mode
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

  await import("./processors/sync-balance-sheet-actuals.processor.js");
  await import("./processors/stage-balance-sheet-actuals.processor.js");
  await import("./processors/transform-balance-sheet-actuals.processor.js");
  await import("./processors/project-balance-sheet-actuals.processor.js");
}

export async function startDomainWorker(workerMode: WorkerMode): Promise<void> {
  await startPgBoss();
  await loadProcessorsForMode(workerMode);
}

export async function stopDomainWorker(): Promise<void> {
  await releaseActiveSyncLocks();
  await stopPgBoss();
}
