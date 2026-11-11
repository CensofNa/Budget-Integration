import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { prisma } from "@budget-integration/database";

import {
  syncPropertyQueue,
  syncPropertyUnitQueue,
  syncUnitTypeQueue,
  syncGlTreeQueue,
  createLogger,
  getPaginatedLogs,
  type LogLevel
} from "@budget-integration/integration-core";

import type {
  SyncPropertiesRequestDto,
  SyncPropertyUnitsRequestDto,
  SyncUnitTypesRequestDto,
  SyncGlTreeRequestDto
} from "@budget-integration/domain-property";

const logger = createLogger("property-service", prisma);

@ApiTags("property-sync")
@Controller("integration-sync")
export class PropertySyncController {
  @Get("health")
  @ApiOperation({ summary: "Health check for Property Domain Service" })
  async getHealth() {
    await logger.info("Health check ping received", { action: "HEALTH_CHECK" });
    return {
      status: "ok",
      service: "property-service",
      domain: "PROPERTY_DOMAIN",
      timestamp: new Date().toISOString()
    };
  }

  @Get("logs")
  @ApiOperation({ summary: "Fetch paginated integration logs from database" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "Page number (default: 1)" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Items per page (default: 20, max: 100)" })
  @ApiQuery({ name: "level", required: false, enum: ["INFO", "WARN", "ERROR"], description: "Log level filter" })
  @ApiQuery({ name: "service", required: false, type: String, description: "Service filter (default: property-service)" })
  @ApiQuery({ name: "entityName", required: false, type: String, description: "Entity name filter (e.g. Property)" })
  @ApiQuery({ name: "action", required: false, type: String, description: "Action tag filter" })
  @ApiQuery({ name: "companyId", required: false, type: String, description: "Company ID filter" })
  @ApiQuery({ name: "syncRunId", required: false, type: String, description: "Sync run ID filter" })
  @ApiQuery({ name: "search", required: false, type: String, description: "Search text in message" })
  @ApiQuery({ name: "startDate", required: false, type: String, description: "Start date ISO string" })
  @ApiQuery({ name: "endDate", required: false, type: String, description: "End date ISO string" })
  async getLogs(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("level") level?: LogLevel,
    @Query("service") service?: string,
    @Query("entityName") entityName?: string,
    @Query("action") action?: string,
    @Query("companyId") companyId?: string,
    @Query("syncRunId") syncRunId?: string,
    @Query("search") search?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ) {
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

  @Post("entrata/properties")
  @ApiOperation({ summary: "Enqueue Entrata properties sync" })
  async syncProperties(
    @Body() body: SyncPropertiesRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
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
      const job = await syncPropertyQueue.add(
        "sync-entrata-property",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "Property",
          ...(body.propertyId ? { propertyId: body.propertyId } : {}),
          ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
          ...(body.fiscalYears ? { fiscalYears: body.fiscalYears } : {}),
          ...(body.forceTransform !== undefined ? { forceTransform: body.forceTransform } : {})
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          },
          removeOnComplete: 100,
          removeOnFail: 1000
        }
      );

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
    } catch (error) {
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

  @Post("entrata/property-units")
  @ApiOperation({ summary: "Enqueue Entrata property units sync" })
  async syncPropertyUnits(
    @Body() body: SyncPropertyUnitsRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
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
      const job = await syncPropertyUnitQueue.add(
        "sync-entrata-property-units",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "PropertyUnit",
          ...(body.propertyId ? { propertyId: body.propertyId } : {}),
          ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
          ...(body.propertyBatchSize ? { propertyBatchSize: body.propertyBatchSize } : {})
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          },
          removeOnComplete: 100,
          removeOnFail: 1000
        }
      );

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
    } catch (error) {
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

  @Post("entrata/unit-types")
  @ApiOperation({ summary: "Enqueue Entrata unit types sync" })
  async syncUnitTypes(
    @Body() body: SyncUnitTypesRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
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
      const job = await syncUnitTypeQueue.add(
        "sync-entrata-unit-types",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "UnitType",
          ...(body.propertyId ? { propertyId: body.propertyId } : {}),
          ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
          ...(body.propertyBatchSize ? { propertyBatchSize: body.propertyBatchSize } : {})
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          },
          removeOnComplete: 100,
          removeOnFail: 1000
        }
      );

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
    } catch (error) {
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

  @Post("entrata/gl-trees")
  @ApiOperation({ summary: "Enqueue Entrata GL trees sync" })
  async syncGlTrees(
    @Body() body: SyncGlTreeRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
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
      const job = await syncGlTreeQueue.add(
        "sync-entrata-gl-trees",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "GlTree",
          ...(body.propertyId ? { propertyId: body.propertyId } : {})
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          },
          removeOnComplete: 100,
          removeOnFail: 1000
        }
      );

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
    } catch (error) {
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
}
