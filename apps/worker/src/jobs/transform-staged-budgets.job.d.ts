export interface TransformStagedBudgetsJobInput {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    syncRunId?: string;
    stagingBatchId?: string;
    batchSize?: number;
}
export declare function transformStagedBudgetsJob(input?: TransformStagedBudgetsJobInput): Promise<{
    transformed: number;
    failed: number;
}>;
//# sourceMappingURL=transform-staged-budgets.job.d.ts.map