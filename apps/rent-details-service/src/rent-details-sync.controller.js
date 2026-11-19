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
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { prisma } from "@budget-integration/database";
import { syncReportDataQueue, projectOccupancyFromReportsQueue, createLogger, getPaginatedLogs } from "@budget-integration/integration-core";
import { SyncReportDataRequestDto } from "@budget-integration/domain-rent";
const logger = createLogger("rent-details-service", prisma);
let RentDetailsSyncController = class RentDetailsSyncController {
    async getHealth() {
        await logger.info("Health check ping received", {
            action: "HEALTH_CHECK"
        });
        return {
            status: "ok",
            service: "rent-details-service",
            domain: "RENT_DETAILS_DOMAIN",
            timestamp: new Date().toISOString()
        };
    }
    async getLogs(page, limit, level, service, entityName, action, search, syncRunId, companyId, startDate, endDate) {
        const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
        const limitNum = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 20;
        const resolvedService = service && service.toLowerCase() === "all" ? undefined : (service ?? "rent-details-service");
        return getPaginatedLogs(prisma, {
            page: pageNum,
            limit: limitNum,
            ...(level ? { level } : {}),
            ...(resolvedService ? { service: resolvedService } : {}),
            ...(entityName ? { entityName } : {}),
            ...(action ? { action } : {}),
            ...(search ? { search } : {}),
            ...(syncRunId ? { syncRunId } : {}),
            ...(companyId ? { companyId } : {}),
            ...(startDate ? { startDate: new Date(startDate) } : {}),
            ...(endDate ? { endDate: new Date(endDate) } : {})
        });
    }
    async syncBoxScore(body) {
        const propertyCount = body.propertyIds?.length ?? 0;
        await logger.info(`Queueing Entrata Box Score report sync [properties=${propertyCount > 0 ? propertyCount : "all"}]`, {
            action: "SYNC_BOX_SCORE_REQUEST",
            entityName: "ReportData",
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            contextJson: {
                reportCode: "box_score",
                propertyCount,
                ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
                ...(body.fiscalYear !== undefined ? { fiscalYear: body.fiscalYear } : {}),
                ...(body.updateReforecast !== undefined ? { updateReforecast: body.updateReforecast } : {}),
                ...(body.reforecastPostMonth ? { reforecastPostMonth: body.reforecastPostMonth } : {})
            }
        });
        try {
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
                ...(body.periodEnd ? { periodEnd: body.periodEnd } : {}),
                ...(body.updateFiscalConfig !== undefined ? { updateFiscalConfig: body.updateFiscalConfig } : {}),
                ...(body.updateReforecast !== undefined ? { updateReforecast: body.updateReforecast } : {}),
                ...(body.reforecastPostMonth ? { reforecastPostMonth: body.reforecastPostMonth } : {})
            }, {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000
                },
                removeOnComplete: 100,
                removeOnFail: 1000
            });
            const jobId = job.id ? String(job.id) : undefined;
            await logger.info(`Entrata Box Score sync job queued [jobId=${jobId ?? "none"}]`, {
                action: "SYNC_BOX_SCORE_QUEUED",
                entityName: "ReportData",
                jobId,
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId
            });
            return {
                queued: true,
                jobId,
                entityName: "ReportData"
            };
        }
        catch (error) {
            await logger.error("Failed to enqueue Entrata Box Score sync job", error, {
                action: "SYNC_BOX_SCORE_FAILED",
                entityName: "ReportData",
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId
            });
            throw error;
        }
    }
    async syncResidentRetention(body) {
        const propertyCount = body.propertyIds?.length ?? 0;
        await logger.info(`Queueing Entrata Resident Retention report sync [properties=${propertyCount > 0 ? propertyCount : "all"}]`, {
            action: "SYNC_RESIDENT_RETENTION_REQUEST",
            entityName: "ReportData",
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            contextJson: {
                reportCode: "resident_retention",
                propertyCount,
                ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
                ...(body.fiscalYear !== undefined ? { fiscalYear: body.fiscalYear } : {}),
                ...(body.updateReforecast !== undefined ? { updateReforecast: body.updateReforecast } : {}),
                ...(body.reforecastPostMonth ? { reforecastPostMonth: body.reforecastPostMonth } : {})
            }
        });
        try {
            const job = await syncReportDataQueue.add("sync-entrata-report-data", {
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId,
                entityName: "ReportData",
                reportCode: "resident_retention",
                ...(body.reportName ? { reportName: body.reportName } : {}),
                ...(body.reportVersion ? { reportVersion: body.reportVersion } : {}),
                ...(body.methodVersion ? { methodVersion: body.methodVersion } : {}),
                ...(body.filters ? { filters: body.filters } : {}),
                ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
                ...(body.fiscalYear ? { fiscalYear: body.fiscalYear } : {}),
                ...(body.includePriorYear !== undefined ? { includePriorYear: body.includePriorYear } : {}),
                ...(body.periodStart ? { periodStart: body.periodStart } : {}),
                ...(body.periodEnd ? { periodEnd: body.periodEnd } : {}),
                ...(body.updateFiscalConfig !== undefined ? { updateFiscalConfig: body.updateFiscalConfig } : {}),
                ...(body.updateReforecast !== undefined ? { updateReforecast: body.updateReforecast } : {}),
                ...(body.reforecastPostMonth ? { reforecastPostMonth: body.reforecastPostMonth } : {})
            }, {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000
                },
                removeOnComplete: 100,
                removeOnFail: 1000
            });
            const jobId = job.id ? String(job.id) : undefined;
            await logger.info(`Entrata Resident Retention sync job queued [jobId=${jobId ?? "none"}]`, {
                action: "SYNC_RESIDENT_RETENTION_QUEUED",
                entityName: "ReportData",
                jobId,
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId
            });
            return {
                queued: true,
                jobId,
                entityName: "ReportData"
            };
        }
        catch (error) {
            await logger.error("Failed to enqueue Entrata Resident Retention sync job", error, {
                action: "SYNC_RESIDENT_RETENTION_FAILED",
                entityName: "ReportData",
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId
            });
            throw error;
        }
    }
    async projectOccupancy(body) {
        await logger.info(`Queueing occupancy projection for property ${body.propertyId} (budgetYear: ${body.budgetYear})`, {
            action: "PROJECT_OCCUPANCY_REQUEST",
            entityName: "Occupancy",
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            contextJson: {
                propertyId: body.propertyId,
                budgetYear: body.budgetYear
            }
        });
        try {
            const job = await projectOccupancyFromReportsQueue.add("project-occupancy-from-reports", {
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId,
                entityName: "Occupancy",
                propertyId: body.propertyId,
                budgetYear: body.budgetYear,
                ...(body.updateReforecast !== undefined ? { updateReforecast: body.updateReforecast } : {}),
                ...(body.reforecastPostMonth ? { reforecastPostMonth: body.reforecastPostMonth } : {})
            }, {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 10000
                },
                removeOnComplete: 100,
                removeOnFail: 1000
            });
            const jobId = job.id ? String(job.id) : undefined;
            await logger.info(`Occupancy projection job queued [jobId=${jobId ?? "none"}]`, {
                action: "PROJECT_OCCUPANCY_QUEUED",
                entityName: "Occupancy",
                jobId,
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId
            });
            return {
                queued: true,
                jobId,
                entityName: "Occupancy"
            };
        }
        catch (error) {
            await logger.error("Failed to enqueue occupancy projection job", error, {
                action: "PROJECT_OCCUPANCY_FAILED",
                entityName: "Occupancy",
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId,
                contextJson: {
                    propertyId: body.propertyId,
                    budgetYear: body.budgetYear
                }
            });
            throw error;
        }
    }
};
__decorate([
    Get("health"),
    ApiOperation({ summary: "Health check for Rent Details Domain Service" }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RentDetailsSyncController.prototype, "getHealth", null);
__decorate([
    Get("logs"),
    ApiOperation({ summary: "Get paginated integration logs from database" }),
    ApiQuery({ name: "page", required: false, type: Number, description: "Page number (defaults to 1)" }),
    ApiQuery({ name: "limit", required: false, type: Number, description: "Items per page (defaults to 20, max 100)" }),
    ApiQuery({ name: "level", required: false, enum: ["INFO", "WARN", "ERROR"], description: "Filter by log level" }),
    ApiQuery({ name: "service", required: false, type: String, description: "Filter by service name (defaults to rent-details-service)" }),
    ApiQuery({ name: "entityName", required: false, type: String, description: "Filter by entity name (e.g. ReportData, Occupancy)" }),
    ApiQuery({ name: "action", required: false, type: String, description: "Filter by action name" }),
    ApiQuery({ name: "search", required: false, type: String, description: "Search text in message" }),
    ApiQuery({ name: "syncRunId", required: false, type: String, description: "Filter by sync run ID" }),
    ApiQuery({ name: "companyId", required: false, type: String, description: "Filter by company ID" }),
    ApiQuery({ name: "startDate", required: false, type: String, description: "ISO start date" }),
    ApiQuery({ name: "endDate", required: false, type: String, description: "ISO end date" }),
    __param(0, Query("page")),
    __param(1, Query("limit")),
    __param(2, Query("level")),
    __param(3, Query("service")),
    __param(4, Query("entityName")),
    __param(5, Query("action")),
    __param(6, Query("search")),
    __param(7, Query("syncRunId")),
    __param(8, Query("companyId")),
    __param(9, Query("startDate")),
    __param(10, Query("endDate")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], RentDetailsSyncController.prototype, "getLogs", null);
__decorate([
    Post("entrata/report-data/box_score"),
    ApiOperation({ summary: "Enqueue Entrata box_score report sync (auto-chains resident_retention and occupancy projection)" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SyncReportDataRequestDto]),
    __metadata("design:returntype", Promise)
], RentDetailsSyncController.prototype, "syncBoxScore", null);
__decorate([
    Post("entrata/report-data/resident_retention"),
    ApiOperation({ summary: "Enqueue Entrata resident_retention report sync" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [SyncReportDataRequestDto]),
    __metadata("design:returntype", Promise)
], RentDetailsSyncController.prototype, "syncResidentRetention", null);
__decorate([
    Post("entrata/occupancy/project"),
    ApiOperation({ summary: "Enqueue occupancy projection from staged/transformed Box Score & Resident Retention reports" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RentDetailsSyncController.prototype, "projectOccupancy", null);
RentDetailsSyncController = __decorate([
    ApiTags("rent-details-sync"),
    Controller("integration-sync")
], RentDetailsSyncController);
export { RentDetailsSyncController };
//# sourceMappingURL=rent-details-sync.controller.js.map