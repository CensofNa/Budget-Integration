import type { ProjectIncomeStatementActualsJobData } from "@budget-integration/integration-core";
type ProjectIncomeStatementActualsResult = {
    syncRunId?: string;
    propertyId?: string;
    fiscalYear?: number;
    propertyYearCount: number;
    totalCalcLinesUpserted: number;
    results: Array<{
        propertyId: string;
        fiscalYear: number;
        snapshotId: string;
        calcLinesUpserted: number;
    }>;
};
export declare function projectIncomeStatementActualsJob(data: ProjectIncomeStatementActualsJobData): Promise<ProjectIncomeStatementActualsResult>;
export {};
//# sourceMappingURL=project-income-statement-actuals.job.d.ts.map