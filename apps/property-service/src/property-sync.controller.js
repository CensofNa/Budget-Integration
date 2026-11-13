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
import { syncPropertyQueue, syncPropertyUnitQueue, syncUnitTypeQueue, syncGlTreeQueue, createLogger, getPaginatedLogs } from "@budget-integration/integration-core";
const logger = createLogger("property-service", prisma);
let PropertySyncController = class PropertySyncController {
    async getHealth() {
        await logger.info("Health check ping received", { action: "HEALTH_CHECK" });
        return {
            status: "ok",
            service: "property-service",
            domain: "PROPERTY_DOMAIN",
            timestamp: new Date().toISOString()
        };
    }
    async getLogs(page, limit, level, service, entityName, action, companyId, syncRunId, search, startDate, endDate) {
        return getPaginatedLogs(prisma, {
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            level,
            service: service ?? "property-service",
            entityName,
            action,
            companyId,
            syncRunId,
            search,
            startDate,
            endDate
        });
    }
    async syncProperties(body) {
        await logger.info("Received request to sync properties", {
            action: "SYNC_PROPERTIES_REQUEST",
            entityName: "Property",
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            contextJson: {
                propertyId: body.propertyId,
                propertyIds: body.propertyIds,
                fiscalYears: body.fiscalYears,
                forceTransform: body.forceTransform
            }
        });
        try {
            const job = await syncPropertyQueue.add("sync-entrata-property", {
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId,
                entityName: "Property",
                ...(body.propertyId ? { propertyId: body.propertyId } : {}),
                ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
                ...(body.fiscalYears ? { fiscalYears: body.fiscalYears } : {}),
                ...(body.forceTransform !== undefined ? { forceTransform: body.forceTransform } : {})
            }, {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000
                },
                removeOnComplete: 100,
                removeOnFail: 1000
            });
            await logger.info(`Successfully enqueued property sync job [jobId=${job.id}]`, {
                action: "SYNC_PROPERTIES_QUEUED",
                entityName: "Property",
                jobId: job.id ? String(job.id) : undefined,
                queueName: "sync-entrata-property",
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId,
                contextJson: {
                    jobId: job.id,
                    propertyId: body.propertyId,
                    propertyIds: body.propertyIds
                }
            });
            return {
                queued: true,
                jobId: job.id ? String(job.id) : undefined,
                entityName: "Property"
            };
        }
        catch (error) {
            await logger.error("Failed to enqueue property sync job", error, {
                action: "SYNC_PROPERTIES_FAILED",
                entityName: "Property",
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId,
                contextJson: body
            });
            throw error;
        }
    }
    async syncPropertyUnits(body) {
        await logger.info("Received request to sync property units", {
            action: "SYNC_PROPERTY_UNITS_REQUEST",
            entityName: "PropertyUnit",
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            contextJson: {
                propertyId: body.propertyId,
                propertyIds: body.propertyIds,
                propertyBatchSize: body.propertyBatchSize
            }
        });
        try {
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
            await logger.info(`Successfully enqueued property units sync job [jobId=${job.id}]`, {
                action: "SYNC_PROPERTY_UNITS_QUEUED",
                entityName: "PropertyUnit",
                jobId: job.id ? String(job.id) : undefined,
                queueName: "sync-entrata-property-units",
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId,
                contextJson: {
                    jobId: job.id,
                    propertyId: body.propertyId,
                    propertyIds: body.propertyIds
                }
            });
            return {
                queued: true,
                jobId: job.id ? String(job.id) : undefined,
                entityName: "PropertyUnit"
            };
        }
        catch (error) {
            await logger.error("Failed to enqueue property units sync job", error, {
                action: "SYNC_PROPERTY_UNITS_FAILED",
                entityName: "PropertyUnit",
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId,
                contextJson: body
            });
            throw error;
        }
    }
    async syncUnitTypes(body) {
        await logger.info("Received request to sync unit types", {
            action: "SYNC_UNIT_TYPES_REQUEST",
            entityName: "UnitType",
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            contextJson: {
                propertyId: body.propertyId,
                propertyIds: body.propertyIds,
                propertyBatchSize: body.propertyBatchSize
            }
        });
        try {
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
            await logger.info(`Successfully enqueued unit types sync job [jobId=${job.id}]`, {
                action: "SYNC_UNIT_TYPES_QUEUED",
                entityName: "UnitType",
                jobId: job.id ? String(job.id) : undefined,
                queueName: "sync-entrata-unit-types",
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId,
                contextJson: {
                    jobId: job.id,
                    propertyId: body.propertyId,
                    propertyIds: body.propertyIds
                }
            });
            return {
                queued: true,
                jobId: job.id ? String(job.id) : undefined,
                entityName: "UnitType"
            };
        }
        catch (error) {
            await logger.error("Failed to enqueue unit types sync job", error, {
                action: "SYNC_UNIT_TYPES_FAILED",
                entityName: "UnitType",
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId,
                contextJson: body
            });
            throw error;
        }
    }
    async syncGlTrees(body) {
        await logger.info("Received request to sync GL trees", {
            action: "SYNC_GL_TREES_REQUEST",
            entityName: "GlTree",
            companyId: body.companyId,
            organisationId: body.organisationId,
            integrationSourceId: body.integrationSourceId,
            contextJson: {
                propertyId: body.propertyId
            }
        });
        try {
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
            await logger.info(`Successfully enqueued GL trees sync job [jobId=${job.id}]`, {
                action: "SYNC_GL_TREES_QUEUED",
                entityName: "GlTree",
                jobId: job.id ? String(job.id) : undefined,
                queueName: "sync-entrata-gl-trees",
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId,
                contextJson: {
                    jobId: job.id,
                    propertyId: body.propertyId
                }
            });
            return {
                queued: true,
                jobId: job.id ? String(job.id) : undefined,
                entityName: "GlTree"
            };
        }
        catch (error) {
            await logger.error("Failed to enqueue GL trees sync job", error, {
                action: "SYNC_GL_TREES_FAILED",
                entityName: "GlTree",
                companyId: body.companyId,
                organisationId: body.organisationId,
                integrationSourceId: body.integrationSourceId,
                contextJson: body
            });
            throw error;
        }
    }
};
__decorate([
    Get("health"),
    ApiOperation({ summary: "Health check for Property Domain Service" }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PropertySyncController.prototype, "getHealth", null);
__decorate([
    Get("logs"),
    ApiOperation({ summary: "Fetch paginated integration logs from database" }),
    ApiQuery({ name: "page", required: false, type: Number, description: "Page number (default: 1)" }),
    ApiQuery({ name: "limit", required: false, type: Number, description: "Items per page (default: 20, max: 100)" }),
    ApiQuery({ name: "level", required: false, enum: ["INFO", "WARN", "ERROR"], description: "Log level filter" }),
    ApiQuery({ name: "service", required: false, type: String, description: "Service filter (default: property-service)" }),
    ApiQuery({ name: "entityName", required: false, type: String, description: "Entity name filter (e.g. Property)" }),
    ApiQuery({ name: "action", required: false, type: String, description: "Action tag filter" }),
    ApiQuery({ name: "companyId", required: false, type: String, description: "Company ID filter" }),
    ApiQuery({ name: "syncRunId", required: false, type: String, description: "Sync run ID filter" }),
    ApiQuery({ name: "search", required: false, type: String, description: "Search text in message" }),
    ApiQuery({ name: "startDate", required: false, type: String, description: "Start date ISO string" }),
    ApiQuery({ name: "endDate", required: false, type: String, description: "End date ISO string" }),
    __param(0, Query("page")),
    __param(1, Query("limit")),
    __param(2, Query("level")),
    __param(3, Query("service")),
    __param(4, Query("entityName")),
    __param(5, Query("action")),
    __param(6, Query("companyId")),
    __param(7, Query("syncRunId")),
    __param(8, Query("search")),
    __param(9, Query("startDate")),
    __param(10, Query("endDate")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PropertySyncController.prototype, "getLogs", null);
__decorate([
    Post("entrata/properties"),
    ApiOperation({ summary: "Enqueue Entrata properties sync" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PropertySyncController.prototype, "syncProperties", null);
__decorate([
    Post("entrata/property-units"),
    ApiOperation({ summary: "Enqueue Entrata property units sync" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PropertySyncController.prototype, "syncPropertyUnits", null);
__decorate([
    Post("entrata/unit-types"),
    ApiOperation({ summary: "Enqueue Entrata unit types sync" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PropertySyncController.prototype, "syncUnitTypes", null);
__decorate([
    Post("entrata/gl-trees"),
    ApiOperation({ summary: "Enqueue Entrata GL trees sync" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PropertySyncController.prototype, "syncGlTrees", null);
PropertySyncController = __decorate([
    ApiTags("property-sync"),
    Controller("integration-sync")
], PropertySyncController);
export { PropertySyncController };
//# sourceMappingURL=property-sync.controller.js.map