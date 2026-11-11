export type ProjectBudgetReportJobData = {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId?: string;
    propertyId?: string;
    fiscalYear?: number;
    accountCode?: string;
};
export declare function projectBudgetReportJob(data: ProjectBudgetReportJobData): Promise<{
    syncRunId: string | undefined;
    propertyId: string | undefined;
    fiscalYear: number;
    accountCode: string | undefined;
    projectedRows: any[];
}>;
//# sourceMappingURL=project-budget-report.job.d.ts.map