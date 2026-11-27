import type { ServerResponse } from "node:http";
import type { SyncBudgetActualRequestDto } from "./dto/sync-budget-actual-request.dto.js";
import type { ProjectIncomeStatementActualsRequestDto } from "./dto/project-income-statement-actuals-request.dto.js";
import type { StageIncomeStatementActualsRequestDto } from "./dto/stage-income-statement-actuals-request.dto.js";
import { SyncIncomeStatementActualsRequestDto } from "./dto/sync-income-statement-actuals-request.dto.js";
import type { TransformIncomeStatementActualsRequestDto } from "./dto/transform-income-statement-actuals-request.dto.js";
import { SyncBudgetReportRequestDto } from "./dto/sync-budget-report-request.dto.js";
import type { StageBudgetReportRequestDto } from "./dto/stage-budget-report-request.dto.js";
import type { TransformBudgetReportRequestDto } from "./dto/transform-budget-report-request.dto.js";
import type { ProjectBudgetReportRequestDto } from "./dto/project-budget-report-request.dto.js";
import type { SyncPropertiesRequestDto } from "./dto/sync-properties-request.dto.js";
import type { SyncPropertyUnitsRequestDto } from "./dto/sync-property-units-request.dto.js";
import type { SyncUnitTypesRequestDto } from "./dto/sync-unit-types-request.dto.js";
import type { SyncBudgetRequestDto } from "./dto/sync-budget-request.dto.js";
import type { SyncGlTreeRequestDto } from "./dto/sync-gl-tree-request.dto.js";
import type { TransformBudgetsRequestDto } from "./dto/transform-budgets-request.dto.js";
import { SyncReportDataRequestDto } from "./dto/sync-report-data-request.dto.js";
import { SyncPropertyClosingsRequestDto } from "./dto/sync-property-closings-request.dto.js";
import { SyncBalanceSheetActualsRequestDto } from "./dto/sync-balance-sheet-actuals-request.dto.js";
import { StageBalanceSheetActualsRequestDto, TransformBalanceSheetActualsRequestDto, ProjectBalanceSheetActualsRequestDto } from "./dto/balance-sheet-actuals-pipeline-request.dto.js";
import { SendBudgetRequestDto, UpdateBudgetRequestDto, type SendBudgetResponse } from "./dto/send-budget-request.dto.js";
import { SendEntrataBudgetsService } from "./services/send-entrata-budgets.service.js";
type QueueResponse = {
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
    stage: "sync" | "stage" | "transform" | "project";
};
export declare class IntegrationSyncController {
    private readonly sendEntrataBudgetsService;
    constructor(sendEntrataBudgetsService?: SendEntrataBudgetsService);
    syncBudgetActuals(body: SyncBudgetActualRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncProperties(body: SyncPropertiesRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncPropertiesDirect(body: SyncPropertiesRequestDto, queryAutoTransform?: string): Promise<{
        success: boolean;
        entityName: string;
        syncRunId: string | undefined;
        stagingBatchId: string | undefined;
        recordsStaged: number;
        transformed: boolean;
        transformResult: {
            transformed: number;
            failed: number;
        } | null;
    }>;
    syncPropertyUnits(body: SyncPropertyUnitsRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncPropertyUnitsDirect(body: SyncPropertyUnitsRequestDto, queryAutoTransform?: string): Promise<{
        success: boolean;
        entityName: string;
        syncRunId: string | undefined;
        recordsReceived: number;
        recordsStaged: number;
        recordsSkipped: number;
        recordsPendingTransform: number;
        transformed: boolean;
        transformResult: {
            transformed: number;
            failed: number;
        } | null;
    }>;
    syncUnitTypes(body: SyncUnitTypesRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncUnitTypesDirect(body: SyncUnitTypesRequestDto, queryAutoTransform?: string): Promise<{
        success: boolean;
        entityName: string;
        syncRunId: string | undefined;
        recordsReceived: number;
        recordsStaged: number;
        recordsSkipped: number;
        recordsPendingTransform: number;
        transformed: boolean;
        transformResult: {
            transformed: number;
            failed: number;
        } | null;
    }>;
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
    syncGlTrees(body: SyncGlTreeRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncGlTreesDirect(body: SyncGlTreeRequestDto, queryAutoTransform?: string): Promise<{
        success: boolean;
        entityName: string;
        syncRunId: string | undefined;
        stagingBatchId: string | undefined;
        recordsReceived: number;
        recordsStaged: number;
        recordsSkipped: number;
        recordsPendingTransform: number;
        transformed: boolean;
        transformResult: {
            transformed: number;
            failed: number;
        } | null;
    }>;
    syncIncomeStatementActuals(body: SyncIncomeStatementActualsRequestDto): Promise<QueueResponse>;
    stageIncomeStatementActuals(body: StageIncomeStatementActualsRequestDto): Promise<QueueResponse>;
    transformIncomeStatementActuals(body: TransformIncomeStatementActualsRequestDto): Promise<QueueResponse>;
    projectIncomeStatementActuals(body: ProjectIncomeStatementActualsRequestDto): Promise<QueueResponse>;
    syncBudgetReport(body: SyncBudgetReportRequestDto, res?: ServerResponse): Promise<void | import("../../../../worker/src/jobs/sync-entrata-budget-report.job.js").SyncBudgetReportJobResult>;
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
    syncBoxScore(body: SyncReportDataRequestDto): Promise<{
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
//# sourceMappingURL=integration-sync.controller.d.ts.map