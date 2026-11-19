import type { ProjectBalanceSheetActualsJobData } from "@budget-integration/integration-core";
type ProjectBalanceSheetActualsResult = {
    syncRunId?: string | undefined;
    propertyId?: string | undefined;
    fiscalYear?: number | undefined;
    propertyYearCount: number;
    totalCalcLinesUpserted: number;
    results: Array<{
        propertyId: string;
        fiscalYear: number;
        snapshotId: string;
        calcLinesUpserted: number;
    }>;
};
export declare function projectBalanceSheetActualsJob(data: ProjectBalanceSheetActualsJobData): Promise<ProjectBalanceSheetActualsResult>;
export {};
//# sourceMappingURL=project-balance-sheet-actuals.job.d.ts.map