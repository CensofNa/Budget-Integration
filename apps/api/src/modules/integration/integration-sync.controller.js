var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, Inject, Optional, Post } from "@nestjs/common";
import { ApiBody } from "@nestjs/swagger";
import { projectIncomeStatementActualsQueue, stageIncomeStatementActualsQueue, syncBudgetActualQueue, syncIncomeStatementActualsQueue, transformIncomeStatementActualsQueue, syncPropertyQueue, syncPropertyUnitQueue, syncUnitTypeQueue, syncBudgetQueue, syncGlTreeQueue, transformBudgetStagingQueue, syncReportDataQueue } from "@budget-integration/integration-core";
import { SyncIncomeStatementActualsRequestDto } from "./dto/sync-income-statement-actuals-request.dto.js";
import { SyncBudgetReportRequestDto } from "./dto/sync-budget-report-request.dto.js";
import { SyncReportDataRequestDto } from "./dto/sync-report-data-request.dto.js";
import { SyncPropertyClosingsRequestDto } from "./dto/sync-property-closings-request.dto.js";
import { prisma } from "@budget-integration/database";
import { syncPropertyClosings } from "@budget-integration/integration-core";
import { syncEntrataBudgetReportJob } from "../../../../worker/src/jobs/sync-entrata-budget-report.job.js";
import { stageBudgetReportJob } from "../../../../worker/src/jobs/stage-budget-report.job.js";
import { transformBudgetReportJob } from "../../../../worker/src/jobs/transform-budget-report.job.js";
import { projectBudgetReportJob } from "../../../../worker/src/jobs/project-budget-report.job.js";
import { SendBudgetRequestDto, UpdateBudgetRequestDto } from "./dto/send-budget-request.dto.js";
import { SendEntrataBudgetsService } from "./services/send-entrata-budgets.service.js";
function buildJobId(...parts) {
    return parts
        .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
        .map((part) => String(part)
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "_"))
        .join("_");
}
let IntegrationSyncController = class IntegrationSyncController {
    sendEntrataBudgetsService;
    constructor(sendEntrataBudgetsService) {
        this.sendEntrataBudgetsService =
            sendEntrataBudgetsService ?? new SendEntrataBudgetsService();
    }
    async syncBudgetActuals(body) {
        const job = await syncBudgetActualQueue.add("sync-entrata-budget-actuals", {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "BudgetActual",
            accountingMethod: body.accountingMethod ?? "Accrual",
            budgetStatusTypeIds: body.budgetStatusTypeIds ?? "1",
            ...(body.propertyId ? { propertyId: body.propertyId } : {}),
            ...(body.budgetIds ? { budgetIds: body.budgetIds } : {}),
            ...(body.startPostMonth ? { startPostMonth: body.startPostMonth } : {}),
            ...(body.endPostMonth ? { endPostMonth: body.endPostMonth } : {})
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "BudgetActual"
        };
    }
    async syncProperties(body) {
        const job = await syncPropertyQueue.add("sync-entrata-property", {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "Property",
            ...(body.propertyId ? { propertyId: body.propertyId } : {}),
            ...(body.propertyIds ? { propertyIds: body.propertyIds } : {})
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "Property"
        };
    }
    async syncPropertyUnits(body) {
        const job = await syncPropertyUnitQueue.add("sync-entrata-property-units", {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "PropertyUnit",
            ...(body.propertyId ? { propertyId: body.propertyId } : {}),
            ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
            ...(body.propertyBatchSize ? { propertyBatchSize: body.propertyBatchSize } : {})
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "PropertyUnit"
        };
    }
    async syncUnitTypes(body) {
        const job = await syncUnitTypeQueue.add("sync-entrata-unit-types", {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "UnitType",
            ...(body.propertyId ? { propertyId: body.propertyId } : {}),
            ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
            ...(body.propertyBatchSize ? { propertyBatchSize: body.propertyBatchSize } : {})
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "UnitType"
        };
    }
    async syncBudgets(body) {
        const job = await syncBudgetQueue.add("sync-entrata-budgets", {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "Budget",
            ...(body.fiscalYears ? { fiscalYears: body.fiscalYears } : {}),
            ...(body.budgetIds ? { budgetIds: body.budgetIds } : {}),
            ...(body.budgetStatusTypeIds ? { budgetStatusTypeIds: body.budgetStatusTypeIds } : {}),
            ...(body.propertyIds ? { propertyIds: body.propertyIds } : body.propertyId ? { propertyId: body.propertyId } : {})
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "Budget"
        };
    }
    async transformBudgets(body) {
        const job = await transformBudgetStagingQueue.add("transform-budget-staging", {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "Budget",
            syncRunId: body.syncRunId,
            ...(body.stagingBatchId ? { stagingBatchId: body.stagingBatchId } : {})
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "Budget"
        };
    }
    async syncGlTrees(body) {
        const job = await syncGlTreeQueue.add("sync-entrata-gl-trees", {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "GlTree",
            ...(body.propertyId ? { propertyId: body.propertyId } : {})
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "GlTree"
        };
    }
    async syncIncomeStatementActuals(body) {
        const jobId = buildJobId("sync-income-statement-actuals", body.integrationSourceId, body.fiscalYear, body.propertyIds?.join("_") ?? "ALL", Date.now());
        // const jobData: SyncIncomeStatementActualsJobData = {
        //   companyId: body.companyId,
        //   organisationId: body.organisationId,
        //   integrationSourceId: body.integrationSourceId,
        //   entityName: "IncomeStatementActuals",
        //   fiscalYear: body.fiscalYear,
        //   glBookIds: body.glBookIds,
        //   accountingMethod: body.accountingMethod ?? "accrual",
        //   periodType: body.periodType ?? "priorpm",
        //   includeDemo: body.includeDemo ?? false,
        //   autoStage: body.autoStage ?? false,
        //   autoTransform: body.autoTransform ?? false,
        //   autoProject: body.autoProject ?? false,
        //   ...(body.propertyIds && body.propertyIds.length > 0
        //     ? { propertyIds: body.propertyIds }
        //     : {}),
        //   ...(body.latestPostMonth
        //     ? { latestPostMonth: body.latestPostMonth }
        //     : {}),
        //   ...(body.glTreeId
        //     ? { glTreeId: body.glTreeId }
        //     : {}),
        //   ...(body.trailingPeriods !== undefined && body.trailingPeriods !== null
        //     ? { trailingPeriods: body.trailingPeriods }
        //     : {})
        // };
        const jobData = {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "IncomeStatementActuals",
            fiscalYear: body.fiscalYear,
            glBookIds: body.glBookIds,
            accountingMethod: body.accountingMethod ?? "accrual",
            periodType: (body.periodType ?? "currentfyr"),
            autoProcess: body.autoProcess ?? false,
            updateReforecast: body.updateReforecast ?? false,
            ...(body.reforecastCutoffMonth ? { reforecastCutoffMonth: body.reforecastCutoffMonth } : {}),
            ...(body.propertyIds?.length ? { propertyIds: body.propertyIds } : {}),
            ...(body.latestPostMonth ? { latestPostMonth: body.latestPostMonth } : {}),
            ...(body.glTreeId ? { glTreeId: body.glTreeId } : {}),
            ...(body.trailingPeriods !== undefined && body.trailingPeriods !== null
                ? { trailingPeriods: body.trailingPeriods }
                : {}),
        };
        const job = await syncIncomeStatementActualsQueue.add("sync-income-statement-actuals", jobData, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000,
            jobId
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "IncomeStatementActuals",
            stage: "sync"
        };
    }
    async stageIncomeStatementActuals(body) {
        const jobId = buildJobId("stage-income-statement-actuals", body.integrationSourceId, body.syncRunId, body.reportLogId, Date.now());
        const job = await stageIncomeStatementActualsQueue.add("stage-income-statement-actuals", {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "IncomeStatementActuals",
            syncRunId: body.syncRunId,
            ...(body.reportLogId ? { reportLogId: body.reportLogId } : {}),
            autoTransform: body.autoTransform ?? false,
            autoProject: body.autoProject ?? false
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000,
            jobId
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "IncomeStatementActuals",
            stage: "stage"
        };
    }
    async transformIncomeStatementActuals(body) {
        const jobId = buildJobId("transform-income-statement-actuals", body.integrationSourceId, body.syncRunId, Date.now());
        const job = await transformIncomeStatementActualsQueue.add("transform-income-statement-actuals", {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "IncomeStatementActuals",
            syncRunId: body.syncRunId,
            autoProject: body.autoProject ?? false
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000,
            jobId
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "IncomeStatementActuals",
            stage: "transform"
        };
    }
    async projectIncomeStatementActuals(body) {
        const jobId = buildJobId("project-income-statement-actuals", body.integrationSourceId, body.syncRunId, body.propertyId, body.fiscalYear, Date.now());
        const job = await projectIncomeStatementActualsQueue.add("project-income-statement-actuals", {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "IncomeStatementActuals",
            ...(body.syncRunId ? { syncRunId: body.syncRunId } : {}),
            ...(body.propertyId ? { propertyId: body.propertyId } : {}),
            ...(body.fiscalYear ? { fiscalYear: body.fiscalYear } : {})
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000,
            jobId
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "IncomeStatementActuals",
            stage: "project"
        };
    }
    async syncBudgetReport(body) {
        return syncEntrataBudgetReportJob({
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            ...(body.fiscalYear !== undefined ? { fiscalYear: body.fiscalYear } : {}),
            ...(body.budgetType ? { budgetType: body.budgetType } : {}),
            ...(body.targetBudgetYear ? { targetBudgetYear: body.targetBudgetYear } : {}),
            ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
            ...(body.ownerFilter ? { ownerFilter: body.ownerFilter } : {}),
            ...(body.glTreeId ? { glTreeId: body.glTreeId } : {}),
            ...(body.glBookIds ? { glBookIds: body.glBookIds } : {}),
            ...(body.budgetStatus ? { budgetStatus: body.budgetStatus } : {}),
            ...(body.includeZeroBalance !== undefined ? { includeZeroBalance: body.includeZeroBalance } : {}),
            autoProcess: body.autoProcess ?? true,
        });
    }
    async stageBudgetReport(body) {
        return stageBudgetReportJob({
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            ...(body.syncRunId ? { syncRunId: body.syncRunId } : {}),
            autoProcess: body.autoProcess ?? true,
        });
    }
    async transformBudgetReport(body) {
        return transformBudgetReportJob({
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            ...(body.syncRunId ? { syncRunId: body.syncRunId } : {}),
            autoProcess: body.autoProcess ?? true,
        });
    }
    async projectBudgetReport(body) {
        return projectBudgetReportJob({
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            ...(body.syncRunId ? { syncRunId: body.syncRunId } : {}),
            ...(body.propertyId ? { propertyId: body.propertyId } : {}),
            ...(body.fiscalYear ? { fiscalYear: body.fiscalYear } : {}),
            ...(body.accountCode ? { accountCode: body.accountCode } : {}),
        });
    }
    async syncPropertyClosings(body) {
        const job = await syncReportDataQueue.add("sync-entrata-report-data", {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "ReportData",
            reportCode: "property_closings",
            ...(body.reportName ? { reportName: body.reportName } : {}),
            ...(body.reportVersion ? { reportVersion: body.reportVersion } : {}),
            ...(body.methodVersion ? { methodVersion: body.methodVersion } : {}),
            ...(body.filters ? { filters: body.filters } : {}),
            ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
            ...(body.fiscalYear ? { fiscalYear: body.fiscalYear } : {}),
            ...(body.includePriorYear !== undefined ? { includePriorYear: body.includePriorYear } : {}),
            ...(body.periodStart ? { periodStart: body.periodStart } : {}),
            ...(body.periodEnd ? { periodEnd: body.periodEnd } : {})
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "ReportData"
        };
    }
    async syncBoxScore(body) {
        const job = await syncReportDataQueue.add("sync-entrata-report-data", {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            entityName: "ReportData",
            reportCode: "box_score",
            ...(body.reportName ? { reportName: body.reportName } : {}),
            ...(body.reportVersion ? { reportVersion: body.reportVersion } : {}),
            ...(body.methodVersion ? { methodVersion: body.methodVersion } : {}),
            ...(body.filters ? { filters: body.filters } : {}),
            ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
            ...(body.fiscalYear ? { fiscalYear: body.fiscalYear } : {}),
            ...(body.includePriorYear !== undefined ? { includePriorYear: body.includePriorYear } : {}),
            ...(body.periodStart ? { periodStart: body.periodStart } : {}),
            ...(body.periodEnd ? { periodEnd: body.periodEnd } : {})
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000
        });
        return {
            queued: true,
            jobId: job.id ? String(job.id) : undefined,
            entityName: "ReportData"
        };
    }
    async syncPropertyClosingsDirect(body) {
        return syncPropertyClosings(prisma, {
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
        });
    }
    async sendBudgets(body) {
        const service = this.sendEntrataBudgetsService ?? new SendEntrataBudgetsService();
        return service.execute(body);
    }
    async updateBudgets(body) {
        const service = this.sendEntrataBudgetsService ?? new SendEntrataBudgetsService();
        return service.executeUpdate(body);
    }
};
__decorate([
    Post("entrata/budget-actuals"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "syncBudgetActuals", null);
__decorate([
    Post("entrata/properties"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "syncProperties", null);
__decorate([
    Post("entrata/property-units"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "syncPropertyUnits", null);
__decorate([
    Post("entrata/unit-types"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "syncUnitTypes", null);
__decorate([
    Post("entrata/budgets"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "syncBudgets", null);
__decorate([
    Post("entrata/budgets/transform"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "transformBudgets", null);
__decorate([
    Post("entrata/gl-trees"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "syncGlTrees", null);
__decorate([
    Post("entrata/income-statement-actuals/sync"),
    ApiBody({ type: SyncIncomeStatementActualsRequestDto }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SyncIncomeStatementActualsRequestDto]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "syncIncomeStatementActuals", null);
__decorate([
    Post("entrata/income-statement-actuals/stage"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "stageIncomeStatementActuals", null);
__decorate([
    Post("entrata/income-statement-actuals/transform"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "transformIncomeStatementActuals", null);
__decorate([
    Post("entrata/income-statement-actuals/project"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "projectIncomeStatementActuals", null);
__decorate([
    Post("entrata/budget-report/sync"),
    ApiBody({ type: SyncBudgetReportRequestDto }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SyncBudgetReportRequestDto]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "syncBudgetReport", null);
__decorate([
    Post("entrata/budget-report/stage"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "stageBudgetReport", null);
__decorate([
    Post("entrata/budget-report/transform"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "transformBudgetReport", null);
__decorate([
    Post("entrata/budget-report/project"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Function]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "projectBudgetReport", null);
__decorate([
    Post("entrata/report-data/property_closings"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SyncReportDataRequestDto]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "syncPropertyClosings", null);
__decorate([
    Post("entrata/report-data/box_score"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SyncReportDataRequestDto]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "syncBoxScore", null);
__decorate([
    Post("entrata/property-closings"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SyncPropertyClosingsRequestDto]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "syncPropertyClosingsDirect", null);
__decorate([
    Post("entrata/send-budgets"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SendBudgetRequestDto]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "sendBudgets", null);
__decorate([
    Post("entrata/update-budgets"),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [UpdateBudgetRequestDto]),
    __metadata("design:returntype", Promise)
], IntegrationSyncController.prototype, "updateBudgets", null);
IntegrationSyncController = __decorate([
    Controller("integration-sync"),
    __param(0, Optional()),
    __param(0, Inject(SendEntrataBudgetsService)),
    __metadata("design:paramtypes", [SendEntrataBudgetsService])
], IntegrationSyncController);
export { IntegrationSyncController };
//# sourceMappingURL=integration-sync.controller.js.map