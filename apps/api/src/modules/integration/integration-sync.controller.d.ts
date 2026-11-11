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
    syncPropertyUnits(body: SyncPropertyUnitsRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncUnitTypes(body: SyncUnitTypesRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
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
    syncIncomeStatementActuals(body: SyncIncomeStatementActualsRequestDto): Promise<QueueResponse>;
    stageIncomeStatementActuals(body: StageIncomeStatementActualsRequestDto): Promise<QueueResponse>;
    transformIncomeStatementActuals(body: TransformIncomeStatementActualsRequestDto): Promise<QueueResponse>;
    projectIncomeStatementActuals(body: ProjectIncomeStatementActualsRequestDto): Promise<QueueResponse>;
    syncBudgetReport(body: SyncBudgetReportRequestDto): Promise<import("../../../../worker/src/jobs/sync-entrata-budget-report.job.js").SyncBudgetReportJobResult>;
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
    sendBudgets(body: SendBudgetRequestDto): Promise<SendBudgetResponse>;
    updateBudgets(body: UpdateBudgetRequestDto): Promise<SendBudgetResponse>;
}
export {};
//# sourceMappingURL=integration-sync.controller.d.ts.map