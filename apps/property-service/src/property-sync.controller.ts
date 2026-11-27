import { Body, Controller, Get, HttpException, HttpStatus, Post, Query } from "@nestjs/common";
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

import { syncEntrataPropertiesJob } from "../../worker/src/jobs/sync-entrata-properties.job.js";
import { transformStagedPropertiesJob } from "../../worker/src/jobs/transform-staged-properties.job.js";
import { syncEntrataPropertyUnitsJob } from "../../worker/src/jobs/sync-entrata-property-units.job.js";
import { transformStagedPropertyUnitsJob } from "../../worker/src/jobs/transform-staged-property-units.job.js";
import { syncEntrataUnitTypesJob } from "../../worker/src/jobs/sync-entrata-unit-types.job.js";
import { transformStagedUnitTypesJob } from "../../worker/src/jobs/transform-staged-unit-types.job.js";
import { syncEntrataGlTreesJob } from "../../worker/src/jobs/sync-entrata-gl-trees.job.js";
import { transformStagedGlTreesJob } from "../../worker/src/jobs/transform-staged-gl-trees.job.js";

const logger = createLogger("property-service", prisma);

function extractErrorInfo(error: unknown) {
  let statusCode = 500;
  let errorMessage = "Unknown error occurred during sync";

  if (error && typeof error === "object" && "isAxiosError" in error) {
    const axiosErr = error as any;
    statusCode = axiosErr.response?.status ?? 502;
    errorMessage =
      axiosErr.response?.data?.response?.error?.message ??
      axiosErr.response?.data?.message ??
      axiosErr.message;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return { statusCode, errorMessage };
}

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

  @Post(["entrata/properties/sync-direct", "entrata/properties/sync-now", "entrata/properties/sync-live"])
  @ApiOperation({ summary: "Synchronously sync Entrata properties without queue" })
  async syncPropertiesDirect(
    @Body() body: SyncPropertiesRequestDto,
    @Query("autoTransform") queryAutoTransform?: string
  ) {
    const autoTransform = body.forceTransform ?? (queryAutoTransform !== "false");

    await logger.info("Received request to synchronously sync properties", {
      action: "SYNC_PROPERTIES_DIRECT_REQUEST",
      entityName: "Property",
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      contextJson: body
    });

    try {
      const syncResult = await syncEntrataPropertiesJob({
        ...(body.companyId ? { companyId: body.companyId } : {}),
        ...(body.organisationId ? { organisationId: body.organisationId } : {}),
        ...(body.integrationSourceId ? { integrationSourceId: body.integrationSourceId } : {}),
        ...(body.propertyId ? { propertyId: body.propertyId } : {}),
        ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
        ...(body.fiscalYears ? { fiscalYears: body.fiscalYears } : {}),
        forceTransform: autoTransform
      });

      let transformResult = null;
      if (syncResult && autoTransform && syncResult.recordsStaged > 0) {
        transformResult = await transformStagedPropertiesJob({
          companyId: syncResult.companyId,
          organisationId: syncResult.organisationId,
          integrationSourceId: syncResult.integrationSourceId,
          syncRunId: syncResult.syncRunId
        });
      }

      await logger.info("Synchronous property sync completed", {
        action: "SYNC_PROPERTIES_DIRECT_SUCCESS",
        entityName: "Property",
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        contextJson: { syncResult, transformResult }
      });

      return {
        success: true,
        entityName: "Property",
        syncRunId: syncResult?.syncRunId,
        stagingBatchId: syncResult?.stagingBatchId,
        recordsStaged: syncResult?.recordsStaged ?? 0,
        transformed: autoTransform,
        transformResult
      };
    } catch (error: unknown) {
      const { statusCode, errorMessage } = extractErrorInfo(error);

      await logger.error("Synchronous property sync failed", error, {
        action: "SYNC_PROPERTIES_DIRECT_FAILED",
        entityName: "Property",
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        contextJson: { statusCode, errorMessage }
      });

      throw new HttpException(
        {
          success: false,
          entityName: "Property",
          statusCode,
          message: errorMessage
        },
        statusCode >= 400 && statusCode < 600 ? statusCode : HttpStatus.INTERNAL_SERVER_ERROR
      );
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

  @Post(["entrata/property-units/sync-direct", "entrata/property-units/sync-now", "entrata/property-units/sync-live"])
  @ApiOperation({ summary: "Synchronously sync Entrata property units without queue" })
  async syncPropertyUnitsDirect(
    @Body() body: SyncPropertyUnitsRequestDto,
    @Query("autoTransform") queryAutoTransform?: string
  ) {
    const autoTransform = queryAutoTransform !== "false";

    await logger.info("Received request to synchronously sync property units", {
      action: "SYNC_PROPERTY_UNITS_DIRECT_REQUEST",
      entityName: "PropertyUnit",
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      contextJson: body
    });

    try {
      const syncResult = await syncEntrataPropertyUnitsJob({
        ...(body.companyId ? { companyId: body.companyId } : {}),
        ...(body.organisationId ? { organisationId: body.organisationId } : {}),
        ...(body.integrationSourceId ? { integrationSourceId: body.integrationSourceId } : {}),
        ...(body.propertyId ? { propertyId: body.propertyId } : {}),
        ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
        ...(body.propertyBatchSize !== undefined ? { propertyBatchSize: body.propertyBatchSize } : {})
      });

      let transformResult = null;
      if (syncResult && autoTransform && syncResult.recordsPendingTransform > 0) {
        transformResult = await transformStagedPropertyUnitsJob({
          companyId: syncResult.companyId,
          organisationId: syncResult.organisationId,
          integrationSourceId: syncResult.integrationSourceId,
          syncRunId: syncResult.syncRunId
        });
      }

      await logger.info("Synchronous property units sync completed", {
        action: "SYNC_PROPERTY_UNITS_DIRECT_SUCCESS",
        entityName: "PropertyUnit",
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        contextJson: { syncResult, transformResult }
      });

      return {
        success: true,
        entityName: "PropertyUnit",
        syncRunId: syncResult?.syncRunId,
        recordsReceived: syncResult?.recordsReceived ?? 0,
        recordsStaged: syncResult?.recordsStaged ?? 0,
        recordsSkipped: syncResult?.recordsSkipped ?? 0,
        recordsPendingTransform: syncResult?.recordsPendingTransform ?? 0,
        transformed: autoTransform,
        transformResult
      };
    } catch (error: unknown) {
      const { statusCode, errorMessage } = extractErrorInfo(error);

      await logger.error("Synchronous property units sync failed", error, {
        action: "SYNC_PROPERTY_UNITS_DIRECT_FAILED",
        entityName: "PropertyUnit",
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        contextJson: { statusCode, errorMessage }
      });

      throw new HttpException(
        {
          success: false,
          entityName: "PropertyUnit",
          statusCode,
          message: errorMessage
        },
        statusCode >= 400 && statusCode < 600 ? statusCode : HttpStatus.INTERNAL_SERVER_ERROR
      );
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

  @Post(["entrata/unit-types/sync-direct", "entrata/unit-types/sync-now", "entrata/unit-types/sync-live"])
  @ApiOperation({ summary: "Synchronously sync Entrata unit types without queue" })
  async syncUnitTypesDirect(
    @Body() body: SyncUnitTypesRequestDto,
    @Query("autoTransform") queryAutoTransform?: string
  ) {
    const autoTransform = queryAutoTransform !== "false";

    await logger.info("Received request to synchronously sync unit types", {
      action: "SYNC_UNIT_TYPES_DIRECT_REQUEST",
      entityName: "UnitType",
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      contextJson: body
    });

    try {
      const syncResult = await syncEntrataUnitTypesJob({
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        ...(body.propertyId ? { propertyId: body.propertyId } : {}),
        ...(body.propertyIds && body.propertyIds.length > 0 ? { propertyIds: body.propertyIds } : {}),
        ...(body.propertyBatchSize !== undefined ? { propertyBatchSize: body.propertyBatchSize } : {})
      });

      let transformResult = null;
      if (syncResult && autoTransform && syncResult.recordsPendingTransform > 0) {
        transformResult = await transformStagedUnitTypesJob({
          companyId: syncResult.companyId,
          organisationId: syncResult.organisationId,
          integrationSourceId: syncResult.integrationSourceId,
          syncRunId: syncResult.syncRunId
        });
      }

      await logger.info("Synchronous unit types sync completed", {
        action: "SYNC_UNIT_TYPES_DIRECT_SUCCESS",
        entityName: "UnitType",
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        contextJson: { syncResult, transformResult }
      });

      return {
        success: true,
        entityName: "UnitType",
        syncRunId: syncResult?.syncRunId,
        recordsReceived: syncResult?.recordsReceived ?? 0,
        recordsStaged: syncResult?.recordsStaged ?? 0,
        recordsSkipped: syncResult?.recordsSkipped ?? 0,
        recordsPendingTransform: syncResult?.recordsPendingTransform ?? 0,
        transformed: autoTransform,
        transformResult
      };
    } catch (error: unknown) {
      const { statusCode, errorMessage } = extractErrorInfo(error);

      await logger.error("Synchronous unit types sync failed", error, {
        action: "SYNC_UNIT_TYPES_DIRECT_FAILED",
        entityName: "UnitType",
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        contextJson: { statusCode, errorMessage }
      });

      throw new HttpException(
        {
          success: false,
          entityName: "UnitType",
          statusCode,
          message: errorMessage
        },
        statusCode >= 400 && statusCode < 600 ? statusCode : HttpStatus.INTERNAL_SERVER_ERROR
      );
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

  @Post(["entrata/gl-trees/sync-direct", "entrata/gl-trees/sync-now", "entrata/gl-trees/sync-live"])
  @ApiOperation({ summary: "Synchronously sync Entrata GL trees without queue" })
  async syncGlTreesDirect(
    @Body() body: SyncGlTreeRequestDto,
    @Query("autoTransform") queryAutoTransform?: string
  ) {
    const autoTransform = queryAutoTransform !== "false";

    await logger.info("Received request to synchronously sync GL trees", {
      action: "SYNC_GL_TREES_DIRECT_REQUEST",
      entityName: "GlTree",
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      contextJson: body
    });

    try {
      const syncResult = await syncEntrataGlTreesJob({
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        entityName: "GlTree"
      });

      let transformResult = null;
      if (syncResult && autoTransform && syncResult.recordsPendingTransform > 0) {
        transformResult = await transformStagedGlTreesJob({
          companyId: syncResult.companyId,
          organisationId: syncResult.organisationId,
          integrationSourceId: syncResult.integrationSourceId,
          syncRunId: syncResult.syncRunId
        });
      }

      await logger.info("Synchronous GL trees sync completed", {
        action: "SYNC_GL_TREES_DIRECT_SUCCESS",
        entityName: "GlTree",
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        contextJson: { syncResult, transformResult }
      });

      return {
        success: true,
        entityName: "GlTree",
        syncRunId: syncResult?.syncRunId,
        stagingBatchId: syncResult?.stagingBatchId,
        recordsReceived: syncResult?.recordsReceived ?? 0,
        recordsStaged: syncResult?.recordsStaged ?? 0,
        recordsSkipped: syncResult?.recordsSkipped ?? 0,
        recordsPendingTransform: syncResult?.recordsPendingTransform ?? 0,
        transformed: autoTransform,
        transformResult
      };
    } catch (error: unknown) {
      const { statusCode, errorMessage } = extractErrorInfo(error);

      await logger.error("Synchronous GL trees sync failed", error, {
        action: "SYNC_GL_TREES_DIRECT_FAILED",
        entityName: "GlTree",
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        contextJson: { statusCode, errorMessage }
      });

      throw new HttpException(
        {
          success: false,
          entityName: "GlTree",
          statusCode,
          message: errorMessage
        },
        statusCode >= 400 && statusCode < 600 ? statusCode : HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
