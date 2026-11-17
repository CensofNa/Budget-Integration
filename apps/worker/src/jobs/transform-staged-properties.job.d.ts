export interface TransformStagedPropertiesJobInput {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    syncRunId?: string;
    stagingBatchId?: string;
    batchSize?: number;
    updateFiscalConfig?: boolean | undefined;
}
export declare function transformStagedPropertiesJob(input?: TransformStagedPropertiesJobInput): Promise<{
    transformed: number;
    failed: number;
}>;
//# sourceMappingURL=transform-staged-properties.job.d.ts.map