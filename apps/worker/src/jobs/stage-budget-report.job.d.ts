export type StageBudgetReportJobData = {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId?: string;
    autoProcess?: boolean;
};
export declare function stageBudgetReportJob(data: StageBudgetReportJobData): Promise<{
    syncRunId: string | undefined;
    stagedCount: any;
    autoProcessed: boolean;
}>;
//# sourceMappingURL=stage-budget-report.job.d.ts.map