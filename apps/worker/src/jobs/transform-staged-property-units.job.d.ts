export interface TransformStagedPropertyUnitsJobInput {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    syncRunId?: string;
    stagingBatchId?: string;
    batchSize?: number;
}
export declare function transformStagedPropertyUnitsJob(input?: TransformStagedPropertyUnitsJobInput): Promise<{
    transformed: number;
    failed: number;
}>;
//# sourceMappingURL=transform-staged-property-units.job.d.ts.map