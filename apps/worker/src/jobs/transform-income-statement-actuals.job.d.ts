import { type TransformIncomeStatementActualsJobData } from "@budget-integration/integration-core";
type TransformIncomeStatementActualsResult = {
    syncRunId: string;
    insertedCount: number;
    updatedCount: number;
    warningCount: number;
    failedCount: number;
    projectQueued: boolean;
};
export declare function transformIncomeStatementActualsJob(data: TransformIncomeStatementActualsJobData): Promise<TransformIncomeStatementActualsResult>;
export {};
//# sourceMappingURL=transform-income-statement-actuals.job.d.ts.map