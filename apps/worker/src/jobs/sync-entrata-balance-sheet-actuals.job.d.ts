import { type SyncBalanceSheetActualsJobData } from "@budget-integration/integration-core";
export type SyncBalanceSheetActualsResult = {
    syncRunId: string;
    reportCode: string;
    reportName: string;
    propertyCount: number;
    successfulCount: number;
    failedCount: number;
    reportLogIds: string[];
    stageResult?: any;
    transformResult?: any;
    projectResult?: any;
};
export declare function syncEntrataBalanceSheetActualsJob(data: SyncBalanceSheetActualsJobData & {
    runSynchronously?: boolean;
}): Promise<SyncBalanceSheetActualsResult>;
//# sourceMappingURL=sync-entrata-balance-sheet-actuals.job.d.ts.map