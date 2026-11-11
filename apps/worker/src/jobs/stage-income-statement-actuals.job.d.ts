import { type StageIncomeStatementActualsJobData } from "@budget-integration/integration-core";
type StageIncomeStatementActualsResult = {
    syncRunId: string;
    reportLogsProcessed: number;
    rowsInsertedOrUpdated: number;
    rowsSkipped: number;
    transformQueued: boolean;
};
export declare function stageIncomeStatementActualsJob(data: StageIncomeStatementActualsJobData): Promise<StageIncomeStatementActualsResult>;
export {};
//# sourceMappingURL=stage-income-statement-actuals.job.d.ts.map