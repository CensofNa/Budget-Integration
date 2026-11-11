export interface TransformStagedGlTreesJobInput {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    syncRunId?: string;
    stagingBatchId?: string;
    batchSize?: number;
}
export declare function transformStagedGlTreesJob(input?: TransformStagedGlTreesJobInput): Promise<{
    transformed: number;
    failed: number;
}>;
//# sourceMappingURL=transform-staged-gl-trees.job.d.ts.map