import { type TransformBudgetActualStagingJobData } from "@budget-integration/integration-core";
export interface TransformBudgetActualsJobInput extends TransformBudgetActualStagingJobData {
    batchSize?: number;
}
export interface TransformBudgetActualsJobResult {
    processed: number;
    transformed: number;
    skipped: number;
    failed: number;
}
export declare function transformStagedBudgetActualsJob(input: TransformBudgetActualsJobInput): Promise<TransformBudgetActualsJobResult>;
//# sourceMappingURL=transform-staged-budget-actuals.job.d.ts.map