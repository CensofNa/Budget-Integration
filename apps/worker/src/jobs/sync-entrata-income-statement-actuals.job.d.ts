import { type SyncIncomeStatementActualsJobData } from "@budget-integration/integration-core";
type SkippedPropertyForYear = {
    propertyCode: string;
    reason: "NOT_CONFIGURED_FOR_FISCAL_YEAR" | "INACTIVE_FOR_FISCAL_YEAR" | "DEMO_PROPERTY_EXCLUDED_FROM_ENTRATA_SYNC";
};
type SyncIncomeStatementActualsResult = {
    syncRunId: string;
    reportCode: string;
    reportName: string;
    propertyCount: number;
    successfulCount: number;
    failedCount: number;
    reportLogIds: string[];
    processJobsQueued: number;
    skippedProperties: SkippedPropertyForYear[];
};
export declare function syncEntrataIncomeStatementActualsJob(data: SyncIncomeStatementActualsJobData): Promise<SyncIncomeStatementActualsResult>;
export {};
//# sourceMappingURL=sync-entrata-income-statement-actuals.job.d.ts.map