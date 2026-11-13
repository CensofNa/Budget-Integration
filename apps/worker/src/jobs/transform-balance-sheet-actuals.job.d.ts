import { type TransformBalanceSheetActualsJobData } from "@budget-integration/integration-core";
type TransformBalanceSheetActualsResult = {
    syncRunId: string;
    insertedCount: number;
    updatedCount: number;
    warningCount: number;
    failedCount: number;
    historyLogsPruned: number;
    projectQueued: boolean;
};
export declare function transformBalanceSheetActualsJob(data: TransformBalanceSheetActualsJobData): Promise<TransformBalanceSheetActualsResult>;
export {};
//# sourceMappingURL=transform-balance-sheet-actuals.job.d.ts.map