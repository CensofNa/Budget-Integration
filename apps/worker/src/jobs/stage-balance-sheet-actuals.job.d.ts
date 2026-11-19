import { type StageBalanceSheetActualsJobData } from "@budget-integration/integration-core";
type StageBalanceSheetActualsResult = {
    syncRunId: string;
    reportLogsProcessed: number;
    rowsInsertedOrUpdated: number;
    rowsSkipped: number;
    transformQueued: boolean;
};
export declare function stageBalanceSheetActualsJob(data: StageBalanceSheetActualsJobData): Promise<StageBalanceSheetActualsResult>;
export {};
//# sourceMappingURL=stage-balance-sheet-actuals.job.d.ts.map