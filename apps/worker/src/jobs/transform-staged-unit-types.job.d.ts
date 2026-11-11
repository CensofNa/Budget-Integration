export interface TransformStagedUnitTypesJobInput {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    syncRunId?: string;
    stagingBatchId?: string;
    batchSize?: number;
}
export declare function transformStagedUnitTypesJob(input?: TransformStagedUnitTypesJobInput): Promise<{
    transformed: number;
    failed: number;
}>;
//# sourceMappingURL=transform-staged-unit-types.job.d.ts.map