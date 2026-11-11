export type TransformBudgetReportJobData = {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId?: string;
    autoProcess?: boolean;
};
export declare function transformBudgetReportJob(data: TransformBudgetReportJobData): Promise<{
    syncRunId: string | undefined;
    transformedCount: any;
    failedCount: any;
    autoProcessed: boolean;
}>;
//# sourceMappingURL=transform-budget-report.job.d.ts.map