export interface TransformStagedReportDataJobInput {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    syncRunId?: string;
    reportRunId?: string;
    reportCode?: string;
    batchSize?: number;
    /**
     * false/default = transform only PENDING rows.
     * true = retry both PENDING and FAILED staging rows.
     */
    retryFailedRows?: boolean;
}
export declare function transformStagedReportDataJob(input?: TransformStagedReportDataJobInput): Promise<{
    transformed: number;
    failed: number;
}>;
//# sourceMappingURL=transform-staged-report-data.job.d.ts.map