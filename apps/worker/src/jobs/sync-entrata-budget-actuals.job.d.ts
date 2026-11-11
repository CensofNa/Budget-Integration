import type { SyncBudgetActualJobData } from "@budget-integration/integration-core";
/** Summary counts returned after a completed sync run. */
export interface SyncEntrataBudgetActualsJobResult {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId: string;
    recordsReceived: number;
    recordsStaged: number;
    recordsSkipped: number;
    recordsPendingTransform: number;
}
/**
 * Main job handler: syncs budget actuals from Entrata into the staging layer.
 *
 * Flow:
 *  1. Resolves the active Entrata integration source and its credentials.
 *  2. Builds a list of request plans (property × budget × GL tree) from the DB.
 *  3. For each plan, calls `getBudgetActuals` on the Entrata API for the relevant post month(s).
 *  4. Upserts each returned row into `stagingBudgetActual`, skipping unchanged records (hash match).
 *  5. Updates the `integrationSyncRun` record with final counts and status.
 *
 * Returns null if no active source or no request plans are found.
 */
export declare function syncEntrataBudgetActualsJob(input: SyncBudgetActualJobData): Promise<SyncEntrataBudgetActualsJobResult | null>;
//# sourceMappingURL=sync-entrata-budget-actuals.job.d.ts.map