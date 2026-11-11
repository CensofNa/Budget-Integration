export interface ProcessIncomeStatementPropertyJobData {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId: string;
    sourcePropertyId: string;
    propertyId?: string;
    propertyCode?: string;
    fiscalYear: number;
    updateReforecast?: boolean;
    reforecastCutoffMonth?: string;
}
export declare function processIncomeStatementPropertyJob(data: ProcessIncomeStatementPropertyJobData): Promise<any>;
//# sourceMappingURL=process-income-statement-property.job.d.ts.map