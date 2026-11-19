import type { ServerResponse } from "node:http";
import { type LogLevel } from "@budget-integration/integration-core";
import { SyncIncomeStatementActualsRequestDto, SyncBalanceSheetActualsRequestDto, StageBalanceSheetActualsRequestDto, TransformBalanceSheetActualsRequestDto, ProjectBalanceSheetActualsRequestDto, SyncBudgetReportRequestDto, SendBudgetRequestDto, UpdateBudgetRequestDto, SendEntrataBudgetsService, type SyncBudgetActualRequestDto, type ProjectIncomeStatementActualsRequestDto, type StageIncomeStatementActualsRequestDto, type TransformIncomeStatementActualsRequestDto, type StageBudgetReportRequestDto, type TransformBudgetReportRequestDto, type ProjectBudgetReportRequestDto, type SyncBudgetRequestDto, type TransformBudgetsRequestDto, type SendBudgetResponse } from "@budget-integration/domain-budget";
import { SyncReportDataRequestDto, SyncPropertyClosingsRequestDto } from "@budget-integration/domain-rent";
type QueueResponse = {
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
    stage: "sync" | "stage" | "transform" | "project";
};
export declare class BudgetSyncController {
    private readonly sendEntrataBudgetsService;
    constructor(sendEntrataBudgetsService?: SendEntrataBudgetsService);
    getHealth(): Promise<{
        status: string;
        service: string;
        domain: string;
        timestamp: string;
    }>;
    getLogs(page?: string, limit?: string, level?: LogLevel, service?: string, entityName?: string, action?: string, companyId?: string, syncRunId?: string, search?: string, startDate?: string, endDate?: string): Promise<import("@budget-integration/integration-core").PaginatedLogsResult<any>>;
    syncBudgets(body: SyncBudgetRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    transformBudgets(body: TransformBudgetsRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncBudgetActuals(body: SyncBudgetActualRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncIncomeStatementActuals(body: SyncIncomeStatementActualsRequestDto): Promise<QueueResponse>;
    stageIncomeStatementActuals(body: StageIncomeStatementActualsRequestDto): Promise<QueueResponse>;
    transformIncomeStatementActuals(body: TransformIncomeStatementActualsRequestDto): Promise<QueueResponse>;
    projectIncomeStatementActuals(body: ProjectIncomeStatementActualsRequestDto): Promise<QueueResponse>;
    syncBudgetReport(body: SyncBudgetReportRequestDto, res?: ServerResponse): Promise<void | import("../../worker/src/jobs/sync-entrata-budget-report.job.js").SyncBudgetReportJobResult>;
    stageBudgetReport(body: StageBudgetReportRequestDto): Promise<{
        syncRunId: string | undefined;
        stagedCount: any;
        autoProcessed: boolean;
    }>;
    transformBudgetReport(body: TransformBudgetReportRequestDto): Promise<{
        syncRunId: string | undefined;
        transformedCount: any;
        failedCount: any;
        autoProcessed: boolean;
    }>;
    projectBudgetReport(body: ProjectBudgetReportRequestDto): Promise<{
        syncRunId: string | undefined;
        propertyId: string | undefined;
        fiscalYear: number;
        accountCode: string | undefined;
        projectedRows: any[];
    }>;
    syncPropertyClosings(body: SyncReportDataRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncPropertyClosingsDirect(body: SyncPropertyClosingsRequestDto): Promise<{
        success: boolean;
        syncedCount: number;
        errors: string[];
    }>;
    sendOrUpdateBudgets(body: SendBudgetRequestDto, queryPropertyId?: string, queryFiscalYear?: string, queryDryRun?: string): Promise<SendBudgetResponse>;
    sendBudgets(body: SendBudgetRequestDto): Promise<SendBudgetResponse>;
    updateBudgets(body: UpdateBudgetRequestDto): Promise<SendBudgetResponse>;
    syncBalanceSheetActuals(body: SyncBalanceSheetActualsRequestDto, res?: ServerResponse): Promise<any>;
    stageBalanceSheetActuals(body: StageBalanceSheetActualsRequestDto): Promise<any>;
    transformBalanceSheetActuals(body: TransformBalanceSheetActualsRequestDto): Promise<any>;
    projectBalanceSheetActuals(body: ProjectBalanceSheetActualsRequestDto): Promise<any>;
    getSyncRunStatus(syncRunId: string): Promise<{
        success: boolean;
        message: string;
        syncRunId?: never;
        entityName?: never;
        status?: never;
        startedAt?: never;
        completedAt?: never;
        progress?: never;
        currentlyProcessing?: never;
        recentCompleted?: never;
        failedProperties?: never;
    } | {
        success: boolean;
        syncRunId: string;
        entityName: string;
        status: string;
        startedAt: Date;
        completedAt: Date | null;
        progress: {
            totalProperties: number;
            completed: number;
            processing: number;
            queuedOrPending: number;
            failed: number;
            percentComplete: string;
        };
        currentlyProcessing: {
            propertyCode: string;
            propertyId: string | null;
            stage: string;
            startedAt: Date | null;
        }[];
        recentCompleted: {
            propertyCode: string;
            actualRowsUpserted: number;
            calcLinesUpserted: number;
            completedAt: Date | null;
        }[];
        failedProperties: {
            propertyCode: string;
            errorMessage: string | null;
        }[];
        message?: never;
    }>;
    syncIncomeStatementActualsStream(body: SyncIncomeStatementActualsRequestDto, res: ServerResponse): Promise<void>;
    syncBalanceSheetActualsStream(body: SyncBalanceSheetActualsRequestDto, res: ServerResponse): Promise<void>;
    syncBudgetReportStream(body: SyncBudgetReportRequestDto, res: ServerResponse): Promise<void>;
    syncBudgetStreamAlias(body: SyncBudgetReportRequestDto, res: ServerResponse): Promise<void>;
}
export {};
//# sourceMappingURL=budget-sync.controller.d.ts.map