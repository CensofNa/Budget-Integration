import { Body, Controller, Get, Inject, Optional, Param, Post, Query, Res } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { prisma } from "@budget-integration/database";

import {
  projectIncomeStatementActualsQueue,
  stageIncomeStatementActualsQueue,
  syncBudgetActualQueue,
  syncIncomeStatementActualsQueue,
  transformIncomeStatementActualsQueue,
  syncBalanceSheetActualsQueue,
  stageBalanceSheetActualsQueue,
  transformBalanceSheetActualsQueue,
  projectBalanceSheetActualsQueue,
  syncBudgetQueue,
  transformBudgetStagingQueue,
  syncReportDataQueue,
  createLogger,
  getPaginatedLogs,
  type LogLevel,
  type SyncIncomeStatementActualsJobData
} from "@budget-integration/integration-core";

import {
  SyncIncomeStatementActualsRequestDto,
  SyncBalanceSheetActualsRequestDto,
  StageBalanceSheetActualsRequestDto,
  TransformBalanceSheetActualsRequestDto,
  ProjectBalanceSheetActualsRequestDto,
  SyncBudgetReportRequestDto,
  SendBudgetRequestDto,
  UpdateBudgetRequestDto,
  SendEntrataBudgetsService,
  type SyncBudgetActualRequestDto,
  type ProjectIncomeStatementActualsRequestDto,
  type StageIncomeStatementActualsRequestDto,
  type TransformIncomeStatementActualsRequestDto,
  type StageBudgetReportRequestDto,
  type TransformBudgetReportRequestDto,
  type ProjectBudgetReportRequestDto,
  type SyncBudgetRequestDto,
  type TransformBudgetsRequestDto,
  type SendBudgetResponse
} from "@budget-integration/domain-budget";
import { SyncReportDataRequestDto, SyncPropertyClosingsRequestDto, syncPropertyClosings } from "@budget-integration/domain-rent";

import { syncEntrataBudgetReportJob } from "../../worker/src/jobs/sync-entrata-budget-report.job.js";
import { stageBudgetReportJob } from "../../worker/src/jobs/stage-budget-report.job.js";
import { transformBudgetReportJob } from "../../worker/src/jobs/transform-budget-report.job.js";
import { projectBudgetReportJob } from "../../worker/src/jobs/project-budget-report.job.js";
import { syncEntrataBalanceSheetActualsJob } from "../../worker/src/jobs/sync-entrata-balance-sheet-actuals.job.js";
import { stageBalanceSheetActualsJob } from "../../worker/src/jobs/stage-balance-sheet-actuals.job.js";
import { transformBalanceSheetActualsJob } from "../../worker/src/jobs/transform-balance-sheet-actuals.job.js";
import { projectBalanceSheetActualsJob } from "../../worker/src/jobs/project-balance-sheet-actuals.job.js";
import { syncEntrataIncomeStatementActualsJob } from "../../worker/src/jobs/sync-entrata-income-statement-actuals.job.js";

const logger = createLogger("budget-service", prisma);

type QueueResponse = {
  queued: boolean;
  jobId: string | undefined;
  entityName: string;
  stage: "sync" | "stage" | "transform" | "project";
};

function buildJobId(...parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
    .map((part) =>
      String(part)
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "_")
    )
    .join("_");
}

@ApiTags("budget-sync")
@Controller("integration-sync")
export class BudgetSyncController {
  private readonly sendEntrataBudgetsService: SendEntrataBudgetsService;

  constructor(
    @Optional()
    @Inject(SendEntrataBudgetsService)
    sendEntrataBudgetsService?: SendEntrataBudgetsService
  ) {
    this.sendEntrataBudgetsService =
      sendEntrataBudgetsService ?? new SendEntrataBudgetsService();
  }

  @Get("health")
  @ApiOperation({ summary: "Health check for Budget Domain Service" })
  async getHealth() {
    await logger.info("Health check ping received", { action: "HEALTH_CHECK" });
    return {
      status: "ok",
      service: "budget-service",
      domain: "BUDGET_DOMAIN",
      timestamp: new Date().toISOString()
    };
  }

  @Get("logs")
  @ApiOperation({ summary: "Fetch paginated integration logs from database" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "Page number (default: 1)" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Items per page (default: 20, max: 100)" })
  @ApiQuery({ name: "level", required: false, enum: ["INFO", "WARN", "ERROR"], description: "Log level filter" })
  @ApiQuery({ name: "service", required: false, type: String, description: "Service filter (default: budget-service)" })
  @ApiQuery({ name: "entityName", required: false, type: String, description: "Entity name filter" })
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
      service: service ?? "budget-service",
      entityName,
      action,
      companyId,
      syncRunId,
      search,
      startDate,
      endDate
    });
  }

  @Post("entrata/budgets")
  @ApiOperation({ summary: "Enqueue Entrata budgets sync" })
  async syncBudgets(
    @Body() body: SyncBudgetRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
    const propertySummary = body.propertyIds?.length
      ? `${body.propertyIds.length} properties`
      : body.propertyId ?? "all properties";

    await logger.info(`Received request to sync budgets for ${propertySummary} (FY: ${body.fiscalYears ?? "all"})`, {
      action: "SYNC_BUDGETS_REQUEST",
      entityName: "Budget",
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      contextJson: {
        fiscalYears: body.fiscalYears,
        budgetIds: body.budgetIds,
        propertyId: body.propertyId,
        propertyCount: body.propertyIds?.length
      }
    });

    try {
      const job = await syncBudgetQueue.add(
        "sync-entrata-budgets",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "Budget",
          ...(body.fiscalYears ? { fiscalYears: body.fiscalYears } : {}),
          ...(body.budgetIds ? { budgetIds: body.budgetIds } : {}),
          ...(body.budgetStatusTypeIds ? { budgetStatusTypeIds: body.budgetStatusTypeIds } : {}),
          ...(body.propertyIds ? { propertyIds: body.propertyIds } : body.propertyId ? { propertyId: body.propertyId } : {}),
          ...(body.updateFiscalConfig !== undefined ? { updateFiscalConfig: body.updateFiscalConfig } : {})
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

      await logger.info(`Successfully enqueued budget sync job [jobId=${job.id}]`, {
        action: "SYNC_BUDGETS_QUEUED",
        entityName: "Budget",
        jobId: job.id ? String(job.id) : undefined,
        queueName: "sync-entrata-budgets",
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId
      });

      return {
        queued: true,
        jobId: job.id ? String(job.id) : undefined,
        entityName: "Budget"
      };
    } catch (error) {
      await logger.error("Failed to enqueue budget sync job", error, {
        action: "SYNC_BUDGETS_FAILED",
        entityName: "Budget",
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId
      });
      throw error;
    }
  }

  @Post("entrata/budgets/transform")
  @ApiOperation({ summary: "Enqueue Entrata budget staging transform" })
  async transformBudgets(
    @Body() body: TransformBudgetsRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
    await logger.info(`Received request to transform staged budgets [syncRunId=${body.syncRunId}]`, {
      action: "TRANSFORM_BUDGETS_REQUEST",
      entityName: "Budget",
      syncRunId: body.syncRunId,
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      contextJson: { stagingBatchId: body.stagingBatchId }
    });

    try {
      const job = await transformBudgetStagingQueue.add(
        "transform-budget-staging",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "Budget",
          syncRunId: body.syncRunId,
          ...(body.stagingBatchId ? { stagingBatchId: body.stagingBatchId } : {})
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

      await logger.info(`Successfully enqueued budget transform job [jobId=${job.id}]`, {
        action: "TRANSFORM_BUDGETS_QUEUED",
        entityName: "Budget",
        jobId: job.id ? String(job.id) : undefined,
        syncRunId: body.syncRunId,
        companyId: body.companyId,
        organisationId: body.organisationId
      });

      return {
        queued: true,
        jobId: job.id ? String(job.id) : undefined,
        entityName: "Budget"
      };
    } catch (error) {
      await logger.error("Failed to enqueue budget transform job", error, {
        action: "TRANSFORM_BUDGETS_FAILED",
        entityName: "Budget",
        syncRunId: body.syncRunId,
        companyId: body.companyId
      });
      throw error;
    }
  }

  @Post("entrata/budget-actuals")
  @ApiOperation({ summary: "Enqueue Entrata budget actuals sync" })
  async syncBudgetActuals(
    @Body() body: SyncBudgetActualRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
    await logger.info(`Received request to sync budget actuals for property ${body.propertyId ?? "all"} (${body.startPostMonth ?? "start"} - ${body.endPostMonth ?? "end"})`, {
      action: "SYNC_BUDGET_ACTUALS_REQUEST",
      entityName: "BudgetActual",
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      contextJson: {
        accountingMethod: body.accountingMethod,
        propertyId: body.propertyId,
        startPostMonth: body.startPostMonth,
        endPostMonth: body.endPostMonth
      }
    });

    try {
      const job = await syncBudgetActualQueue.add(
        "sync-entrata-budget-actuals",
        {
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

      await logger.info(`Successfully enqueued budget actuals sync job [jobId=${job.id}]`, {
        action: "SYNC_BUDGET_ACTUALS_QUEUED",
        entityName: "BudgetActual",
        jobId: job.id ? String(job.id) : undefined,
        companyId: body.companyId,
        organisationId: body.organisationId
      });

      return {
        queued: true,
        jobId: job.id ? String(job.id) : undefined,
        entityName: "BudgetActual"
      };
    } catch (error) {
      await logger.error("Failed to enqueue budget actuals sync job", error, {
        action: "SYNC_BUDGET_ACTUALS_FAILED",
        entityName: "BudgetActual",
        companyId: body.companyId
      });
      throw error;
    }
  }

  @Post("entrata/income-statement-actuals/sync")
  @ApiBody({ type: SyncIncomeStatementActualsRequestDto })
  @ApiOperation({ summary: "Enqueue Income Statement Actuals sync" })
  async syncIncomeStatementActuals(
    @Body() body: SyncIncomeStatementActualsRequestDto
  ): Promise<QueueResponse> {
    const propCount = body.propertyIds?.length ?? "ALL";
    const jobId = buildJobId(
      "sync-income-statement-actuals",
      body.integrationSourceId,
      body.fiscalYear,
      body.propertyIds?.join("_") ?? "ALL",
      Date.now()
    );

    await logger.info(`Received request to sync Income Statement Actuals for FY${body.fiscalYear} (${propCount} properties, autoProcess=${body.autoProcess ?? false})`, {
      action: "SYNC_IS_ACTUALS_REQUEST",
      entityName: "IncomeStatementActuals",
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      contextJson: {
        fiscalYear: body.fiscalYear,
        propertiesCount: propCount,
        accountingMethod: body.accountingMethod,
        periodType: body.periodType,
        autoProcess: body.autoProcess,
        updateReforecast: body.updateReforecast
      }
    });

    const jobData: SyncIncomeStatementActualsJobData = {
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      entityName: "IncomeStatementActuals",
      fiscalYear: body.fiscalYear,
      glBookIds: body.glBookIds && body.glBookIds.length > 0 ? body.glBookIds : [1909],
      accountingMethod: body.accountingMethod ?? "accrual",
      periodType: (body.periodType ?? "currentfyr") as any,
      autoProcess: body.autoProcess ?? false,
      updateReforecast: body.updateReforecast ?? false,
      ...(body.reforecastCutoffMonth ? { reforecastCutoffMonth: body.reforecastCutoffMonth } : {}),
      ...(body.propertyIds?.length ? { propertyIds: body.propertyIds } : {}),
      ...(body.latestPostMonth ? { latestPostMonth: body.latestPostMonth } : {}),
      ...(body.glTreeId ? { glTreeId: body.glTreeId } : {}),
      ...(body.ownerFilter ? { ownerFilter: body.ownerFilter } : {}),
      ...(body.forceAll !== undefined ? { forceAll: body.forceAll } : {}),
      ...(body.trailingPeriods !== undefined && body.trailingPeriods !== null
        ? { trailingPeriods: body.trailingPeriods }
        : {})
    };

    try {
      const job = await syncIncomeStatementActualsQueue.add(
        "sync-income-statement-actuals",
        jobData,
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          },
          removeOnComplete: 100,
          removeOnFail: 1000,
          jobId
        }
      );

      await logger.info(`Successfully enqueued Income Statement Actuals sync job [jobId=${job.id}]`, {
        action: "SYNC_IS_ACTUALS_QUEUED",
        entityName: "IncomeStatementActuals",
        jobId: job.id ? String(job.id) : undefined,
        queueName: "sync-income-statement-actuals",
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId
      });

      return {
        queued: true,
        jobId: job.id ? String(job.id) : undefined,
        entityName: "IncomeStatementActuals",
        stage: "sync"
      };
    } catch (error) {
      await logger.error("Failed to enqueue Income Statement Actuals sync job", error, {
        action: "SYNC_IS_ACTUALS_FAILED",
        entityName: "IncomeStatementActuals",
        companyId: body.companyId,
        contextJson: { fiscalYear: body.fiscalYear, jobId }
      });
      throw error;
    }
  }

  @Post("entrata/income-statement-actuals/stage")
  @ApiOperation({ summary: "Enqueue Income Statement Actuals stage" })
  async stageIncomeStatementActuals(
    @Body() body: StageIncomeStatementActualsRequestDto
  ): Promise<QueueResponse> {
    const jobId = buildJobId(
      "stage-income-statement-actuals",
      body.integrationSourceId,
      body.syncRunId,
      body.reportLogId,
      Date.now()
    );

    await logger.info(`Received request to stage Income Statement Actuals [syncRunId=${body.syncRunId}]`, {
      action: "STAGE_IS_ACTUALS_REQUEST",
      entityName: "IncomeStatementActuals",
      syncRunId: body.syncRunId,
      companyId: body.companyId,
      organisationId: body.organisationId,
      contextJson: { reportLogId: body.reportLogId, autoTransform: body.autoTransform, autoProject: body.autoProject }
    });

    try {
      const job = await stageIncomeStatementActualsQueue.add(
        "stage-income-statement-actuals",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "IncomeStatementActuals",
          syncRunId: body.syncRunId,
          ...(body.reportLogId ? { reportLogId: body.reportLogId } : {}),
          autoTransform: body.autoTransform ?? false,
          autoProject: body.autoProject ?? false
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          },
          removeOnComplete: 100,
          removeOnFail: 1000,
          jobId
        }
      );

      await logger.info(`Successfully enqueued Income Statement Actuals staging job [jobId=${job.id}]`, {
        action: "STAGE_IS_ACTUALS_QUEUED",
        entityName: "IncomeStatementActuals",
        jobId: job.id ? String(job.id) : undefined,
        syncRunId: body.syncRunId,
        companyId: body.companyId
      });

      return {
        queued: true,
        jobId: job.id ? String(job.id) : undefined,
        entityName: "IncomeStatementActuals",
        stage: "stage"
      };
    } catch (error) {
      await logger.error("Failed to enqueue Income Statement Actuals staging job", error, {
        action: "STAGE_IS_ACTUALS_FAILED",
        entityName: "IncomeStatementActuals",
        syncRunId: body.syncRunId,
        companyId: body.companyId
      });
      throw error;
    }
  }

  @Post("entrata/income-statement-actuals/transform")
  @ApiOperation({ summary: "Enqueue Income Statement Actuals transform" })
  async transformIncomeStatementActuals(
    @Body() body: TransformIncomeStatementActualsRequestDto
  ): Promise<QueueResponse> {
    const jobId = buildJobId(
      "transform-income-statement-actuals",
      body.integrationSourceId,
      body.syncRunId,
      Date.now()
    );

    await logger.info(`Received request to transform Income Statement Actuals [syncRunId=${body.syncRunId}]`, {
      action: "TRANSFORM_IS_ACTUALS_REQUEST",
      entityName: "IncomeStatementActuals",
      syncRunId: body.syncRunId,
      companyId: body.companyId,
      contextJson: { autoProject: body.autoProject }
    });

    try {
      const job = await transformIncomeStatementActualsQueue.add(
        "transform-income-statement-actuals",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "IncomeStatementActuals",
          syncRunId: body.syncRunId,
          autoProject: body.autoProject ?? false
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          },
          removeOnComplete: 100,
          removeOnFail: 1000,
          jobId
        }
      );

      await logger.info(`Successfully enqueued Income Statement Actuals transform job [jobId=${job.id}]`, {
        action: "TRANSFORM_IS_ACTUALS_QUEUED",
        entityName: "IncomeStatementActuals",
        jobId: job.id ? String(job.id) : undefined,
        syncRunId: body.syncRunId,
        companyId: body.companyId
      });

      return {
        queued: true,
        jobId: job.id ? String(job.id) : undefined,
        entityName: "IncomeStatementActuals",
        stage: "transform"
      };
    } catch (error) {
      await logger.error("Failed to enqueue Income Statement Actuals transform job", error, {
        action: "TRANSFORM_IS_ACTUALS_FAILED",
        entityName: "IncomeStatementActuals",
        syncRunId: body.syncRunId,
        companyId: body.companyId
      });
      throw error;
    }
  }

  @Post("entrata/income-statement-actuals/project")
  @ApiOperation({ summary: "Enqueue Income Statement Actuals projection" })
  async projectIncomeStatementActuals(
    @Body() body: ProjectIncomeStatementActualsRequestDto
  ): Promise<QueueResponse> {
    const jobId = buildJobId(
      "project-income-statement-actuals",
      body.integrationSourceId,
      body.syncRunId,
      body.propertyId,
      body.fiscalYear,
      Date.now()
    );

    await logger.info(`Received request to project Income Statement Actuals (propertyId=${body.propertyId ?? "all"}, FY=${body.fiscalYear ?? "all"})`, {
      action: "PROJECT_IS_ACTUALS_REQUEST",
      entityName: "IncomeStatementActuals",
      syncRunId: body.syncRunId,
      companyId: body.companyId,
      contextJson: { propertyId: body.propertyId, fiscalYear: body.fiscalYear }
    });

    try {
      const job = await projectIncomeStatementActualsQueue.add(
        "project-income-statement-actuals",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "IncomeStatementActuals",
          ...(body.syncRunId ? { syncRunId: body.syncRunId } : {}),
          ...(body.propertyId ? { propertyId: body.propertyId } : {}),
          ...(body.fiscalYear ? { fiscalYear: body.fiscalYear } : {})
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          },
          removeOnComplete: 100,
          removeOnFail: 1000,
          jobId
        }
      );

      await logger.info(`Successfully enqueued Income Statement Actuals projection job [jobId=${job.id}]`, {
        action: "PROJECT_IS_ACTUALS_QUEUED",
        entityName: "IncomeStatementActuals",
        jobId: job.id ? String(job.id) : undefined,
        syncRunId: body.syncRunId,
        companyId: body.companyId
      });

      return {
        queued: true,
        jobId: job.id ? String(job.id) : undefined,
        entityName: "IncomeStatementActuals",
        stage: "project"
      };
    } catch (error) {
      await logger.error("Failed to enqueue Income Statement Actuals projection job", error, {
        action: "PROJECT_IS_ACTUALS_FAILED",
        entityName: "IncomeStatementActuals",
        syncRunId: body.syncRunId,
        companyId: body.companyId
      });
      throw error;
    }
  }

  @Post("entrata/budget-report/sync")
  @ApiBody({ type: SyncBudgetReportRequestDto })
  @ApiOperation({ summary: "Execute Entrata Budget Report sync (supports streaming)" })
  async syncBudgetReport(
    @Body() body: SyncBudgetReportRequestDto,
    @Res({ passthrough: true }) res?: ServerResponse
  ) {
    const wantsStream = body.stream || body.syncMode === "STREAM";
    if (wantsStream && res) {
      return this.syncBudgetReportStream(body, res);
    }

    const propCount = body.propertyCodes?.length ?? body.propertyIds?.length ?? "ALL";
    await logger.info(`Executing Entrata Budget Report sync for FY${body.fiscalYear ?? "current"} (${propCount} properties, budgetType=${body.budgetType ?? "currentfy"}, balanceSheetAccounts=${body.balanceSheetAccounts ?? false})`, {
      action: "BUDGET_REPORT_SYNC_REQUEST",
      entityName: "BudgetReport",
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      contextJson: { fiscalYear: body.fiscalYear, propertiesCount: propCount, budgetType: body.budgetType, autoProcess: body.autoProcess, balanceSheetAccounts: body.balanceSheetAccounts }
    });

    try {
      const result = await syncEntrataBudgetReportJob({
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        ...(body.fiscalYear !== undefined ? { fiscalYear: body.fiscalYear } : {}),
        ...(body.budgetType ? { budgetType: body.budgetType } : {}),
        ...(body.targetBudgetYear ? { targetBudgetYear: body.targetBudgetYear } : {}),
        ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
        ...(body.propertyCodes ? { propertyCodes: body.propertyCodes } : {}),
        ...(body.balanceSheetAccounts !== undefined ? { balanceSheetAccounts: body.balanceSheetAccounts } : {}),
        ...(body.ownerFilter ? { ownerFilter: body.ownerFilter } : {}),
        ...(body.glTreeId ? { glTreeId: body.glTreeId } : {}),
        ...(body.glBookIds ? { glBookIds: body.glBookIds } : {}),
        ...(body.budgetStatus ? { budgetStatus: body.budgetStatus } : {}),
        ...(body.includeZeroBalance !== undefined ? { includeZeroBalance: body.includeZeroBalance } : {}),
        autoProcess: body.autoProcess ?? true,
        updateFiscalConfig: body.updateFiscalConfig ?? false,
      });

      await logger.info(`Budget Report sync completed: synced ${result.propertiesSynced}/${result.propertiesFound} properties [syncRunId=${result.syncRunId}]`, {
        action: "BUDGET_REPORT_SYNC_COMPLETED",
        entityName: "BudgetReport",
        syncRunId: result.syncRunId,
        companyId: body.companyId,
        contextJson: {
          propertiesSynced: result.propertiesSynced,
          propertiesFound: result.propertiesFound,
          stagedCount: result.stagedCount,
          transformedCount: result.transformedCount
        }
      });

      return result;
    } catch (error) {
      await logger.error("Budget Report sync execution failed", error, {
        action: "BUDGET_REPORT_SYNC_FAILED",
        entityName: "BudgetReport",
        companyId: body.companyId
      });
      throw error;
    }
  }

  @Post("entrata/budget-report/stage")
  @ApiOperation({ summary: "Execute Entrata Budget Report stage" })
  async stageBudgetReport(
    @Body() body: StageBudgetReportRequestDto
  ) {
    await logger.info(`Executing Entrata Budget Report staging [syncRunId=${body.syncRunId ?? "latest"}]`, {
      action: "BUDGET_REPORT_STAGE_REQUEST",
      entityName: "BudgetReport",
      syncRunId: body.syncRunId,
      companyId: body.companyId
    });

    try {
      const result = await stageBudgetReportJob({
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        ...(body.syncRunId ? { syncRunId: body.syncRunId } : {}),
        autoProcess: body.autoProcess ?? true
      });

      await logger.info(`Budget Report staging completed: ${result.stagedCount} records staged`, {
        action: "BUDGET_REPORT_STAGE_COMPLETED",
        entityName: "BudgetReport",
        syncRunId: body.syncRunId,
        companyId: body.companyId,
        contextJson: { recordsStaged: result.stagedCount }
      });

      return result;
    } catch (error) {
      await logger.error("Budget Report staging execution failed", error, {
        action: "BUDGET_REPORT_STAGE_FAILED",
        entityName: "BudgetReport",
        syncRunId: body.syncRunId,
        companyId: body.companyId
      });
      throw error;
    }
  }

  @Post("entrata/budget-report/transform")
  @ApiOperation({ summary: "Execute Entrata Budget Report transform" })
  async transformBudgetReport(
    @Body() body: TransformBudgetReportRequestDto
  ) {
    await logger.info(`Executing Entrata Budget Report transform [syncRunId=${body.syncRunId ?? "latest"}]`, {
      action: "BUDGET_REPORT_TRANSFORM_REQUEST",
      entityName: "BudgetReport",
      syncRunId: body.syncRunId,
      companyId: body.companyId
    });

    try {
      const result = await transformBudgetReportJob({
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        ...(body.syncRunId ? { syncRunId: body.syncRunId } : {}),
        autoProcess: body.autoProcess ?? true
      });

      await logger.info(`Budget Report transform completed: ${result.transformedCount} rows transformed`, {
        action: "BUDGET_REPORT_TRANSFORM_COMPLETED",
        entityName: "BudgetReport",
        syncRunId: body.syncRunId,
        companyId: body.companyId,
        contextJson: { transformedRows: result.transformedCount }
      });

      return result;
    } catch (error) {
      await logger.error("Budget Report transform execution failed", error, {
        action: "BUDGET_REPORT_TRANSFORM_FAILED",
        entityName: "BudgetReport",
        syncRunId: body.syncRunId,
        companyId: body.companyId
      });
      throw error;
    }
  }

  @Post("entrata/budget-report/project")
  @ApiOperation({ summary: "Execute Entrata Budget Report projection" })
  async projectBudgetReport(
    @Body() body: ProjectBudgetReportRequestDto
  ) {
    await logger.info(`Executing Entrata Budget Report projection (propertyId=${body.propertyId ?? "all"}, FY=${body.fiscalYear ?? "all"})`, {
      action: "BUDGET_REPORT_PROJECT_REQUEST",
      entityName: "BudgetReport",
      syncRunId: body.syncRunId,
      companyId: body.companyId,
      contextJson: { propertyId: body.propertyId, fiscalYear: body.fiscalYear }
    });

    try {
      const result = await projectBudgetReportJob({
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        ...(body.syncRunId ? { syncRunId: body.syncRunId } : {}),
        ...(body.propertyId ? { propertyId: body.propertyId } : {}),
        ...(body.fiscalYear ? { fiscalYear: body.fiscalYear } : {}),
        ...(body.accountCode ? { accountCode: body.accountCode } : {})
      });

      await logger.info(`Budget Report projection completed: ${result.projectedRows} rows projected`, {
        action: "BUDGET_REPORT_PROJECT_COMPLETED",
        entityName: "BudgetReport",
        syncRunId: body.syncRunId,
        companyId: body.companyId,
        contextJson: { projectedRows: result.projectedRows }
      });

      return result;
    } catch (error) {
      await logger.error("Budget Report projection execution failed", error, {
        action: "BUDGET_REPORT_PROJECT_FAILED",
        entityName: "BudgetReport",
        syncRunId: body.syncRunId,
        companyId: body.companyId
      });
      throw error;
    }
  }

  @Post("entrata/report-data/property_closings")
  @ApiOperation({ summary: "Enqueue Entrata property_closings report sync" })
  async syncPropertyClosings(
    @Body() body: SyncReportDataRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
    await logger.info(`Enqueueing property_closings report sync (properties=${body.propertyIds?.length ?? "ALL"})`, {
      action: "PROPERTY_CLOSINGS_QUEUE_REQUEST",
      entityName: "ReportData",
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      contextJson: { propertyCount: body.propertyIds?.length, fiscalYear: body.fiscalYear }
    });

    try {
      const job = await syncReportDataQueue.add(
        "sync-entrata-report-data",
        {
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

      await logger.info(`Successfully enqueued property_closings report sync [jobId=${job.id}]`, {
        action: "PROPERTY_CLOSINGS_QUEUED",
        entityName: "ReportData",
        jobId: job.id ? String(job.id) : undefined,
        companyId: body.companyId
      });

      return {
        queued: true,
        jobId: job.id ? String(job.id) : undefined,
        entityName: "ReportData"
      };
    } catch (error) {
      await logger.error("Failed to enqueue property_closings report sync", error, {
        action: "PROPERTY_CLOSINGS_QUEUE_FAILED",
        entityName: "ReportData",
        companyId: body.companyId
      });
      throw error;
    }
  }

  @Post("entrata/property-closings")
  @ApiOperation({ summary: "Synchronous inline property closings sync" })
  async syncPropertyClosingsDirect(
    @Body() body: SyncPropertyClosingsRequestDto
  ): Promise<{
    success: boolean;
    syncedCount: number;
    errors: string[];
  }> {
    await logger.info(`Executing inline property closings sync (properties=${body.propertyIds?.length ?? "ALL"})`, {
      action: "PROPERTY_CLOSINGS_DIRECT_REQUEST",
      entityName: "PropertyClosing",
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      contextJson: { propertyCount: body.propertyIds?.length }
    });

    try {
      const result = await syncPropertyClosings(prisma, {
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        ...(body.propertyIds ? { propertyIds: body.propertyIds } : {})
      });

      if (result.errors.length > 0) {
        await logger.warn(`Property closings sync completed with ${result.errors.length} error(s); synced ${result.syncedCount} properties`, {
          action: "PROPERTY_CLOSINGS_DIRECT_WARNING",
          entityName: "PropertyClosing",
          companyId: body.companyId,
          contextJson: { syncedCount: result.syncedCount, errors: result.errors }
        });
      } else {
        await logger.info(`Property closings sync completed successfully: ${result.syncedCount} properties updated`, {
          action: "PROPERTY_CLOSINGS_DIRECT_COMPLETED",
          entityName: "PropertyClosing",
          companyId: body.companyId,
          contextJson: { syncedCount: result.syncedCount }
        });
      }

      return result;
    } catch (error) {
      await logger.error("Inline property closings sync failed", error, {
        action: "PROPERTY_CLOSINGS_DIRECT_FAILED",
        entityName: "PropertyClosing",
        companyId: body.companyId
      });
      throw error;
    }
  }

  @Post("entrata/send-budgets")
  @ApiOperation({ summary: "Send budget to Entrata" })
  async sendBudgets(
    @Body() body: SendBudgetRequestDto
  ): Promise<SendBudgetResponse> {
    await logger.info(`Executing send budget to Entrata for property ${body.propertyId} (FY: ${body.fiscalYear})`, {
      action: "SEND_BUDGET_REQUEST",
      entityName: "Budget",
      contextJson: { propertyId: body.propertyId, fiscalYear: body.fiscalYear }
    });

    try {
      const service = this.sendEntrataBudgetsService ?? new SendEntrataBudgetsService();
      const result = await service.execute(body);

      await logger.info(`Send budget finished: success=${result.success}, requestId=${result.requestId ?? "none"}`, {
        action: "SEND_BUDGET_COMPLETED",
        entityName: "Budget",
        contextJson: {
          success: result.success,
          ...(result.requestId ? { requestId: result.requestId } : {}),
          ...(result.budgetId ? { budgetId: result.budgetId } : {})
        }
      });

      return result;
    } catch (error) {
      await logger.error("Send budget to Entrata failed", error, {
        action: "SEND_BUDGET_FAILED",
        entityName: "Budget",
        contextJson: { propertyId: body.propertyId, fiscalYear: body.fiscalYear }
      });
      throw error;
    }
  }

  @Post("entrata/update-budgets")
  @ApiOperation({ summary: "Update budget in Entrata" })
  async updateBudgets(
    @Body() body: UpdateBudgetRequestDto
  ): Promise<SendBudgetResponse> {
    await logger.info(`Executing update budget in Entrata for property ${body.propertyId} (FY: ${body.fiscalYear})`, {
      action: "UPDATE_BUDGET_REQUEST",
      entityName: "Budget",
      contextJson: { propertyId: body.propertyId, fiscalYear: body.fiscalYear }
    });

    try {
      const service = this.sendEntrataBudgetsService ?? new SendEntrataBudgetsService();
      const result = await service.executeUpdate(body);

      await logger.info(`Update budget finished: success=${result.success}, requestId=${result.requestId ?? "none"}`, {
        action: "UPDATE_BUDGET_COMPLETED",
        entityName: "Budget",
        contextJson: {
          success: result.success,
          ...(result.requestId ? { requestId: result.requestId } : {}),
          ...(result.budgetId ? { budgetId: result.budgetId } : {})
        }
      });

      return result;
    } catch (error) {
      await logger.error("Update budget in Entrata failed", error, {
        action: "UPDATE_BUDGET_FAILED",
        entityName: "Budget",
        contextJson: { propertyId: body.propertyId, fiscalYear: body.fiscalYear }
      });
      throw error;
    }
  }

  // ==============================================================================
  // ENTRATA BALANCE SHEET ACTUALS ENDPOINTS
  // ==============================================================================

  @Post("entrata/balance-sheet/sync")
  @ApiBody({ type: SyncBalanceSheetActualsRequestDto })
  @ApiOperation({ summary: "Sync Entrata Balance Sheet Actuals (on-demand or queue)" })
  async syncBalanceSheetActuals(
    @Body() body: SyncBalanceSheetActualsRequestDto,
    @Res({ passthrough: true }) res?: ServerResponse
  ): Promise<any> {
    const propCount = body.propertyCodes?.length ?? body.propertyIds?.length ?? "ALL";
    const wantsStream = body.stream || body.syncMode === "STREAM";

    if (wantsStream && res) {
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      });

      const writeLog = (msg: string) => {
        res.write(`${new Date().toISOString()} ${msg}\n`);
      };

      writeLog(`[INFO] Starting live-stream Balance Sheet Actuals sync (FY: ${body.fiscalYear ?? "CURRENT"}, properties: ${propCount})...`);

      try {
        const result = await syncEntrataBalanceSheetActualsJob({
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "BalanceSheetActuals",
          ...(body.fiscalYear !== undefined ? { fiscalYear: body.fiscalYear } : {}),
          ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
          ...(body.propertyCodes ? { propertyCodes: body.propertyCodes } : {}),
          ...(body.ownerFilter ? { ownerFilter: body.ownerFilter } : {}),
          ...(body.glTreeId ? { glTreeId: body.glTreeId } : {}),
          glBookId: body.glBookIds?.[0] ?? 1909,
          accountingMethod: body.accountingMethod ?? "accrual",
          ...(body.trailingPeriods !== undefined ? { trailingPeriods: body.trailingPeriods } : {}),
          autoStage: body.autoStage ?? true,
          autoTransform: body.autoTransform ?? true,
          autoProject: body.autoProject ?? true,
          runSynchronously: true,
          onProgress: (msg: string) => {
            writeLog(msg);
          },
        });

        writeLog(`\n[SUCCESS] Sync completed! SyncRunId: ${result.syncRunId} | Total properties: ${result.propertyCount} | Successful: ${result.successfulCount} | Failed: ${result.failedCount}`);
        res.end();
        return;
      } catch (err: any) {
        writeLog(`\n[ERROR] Sync job encountered an error: ${err.message || String(err)}`);
        res.end();
        return;
      }
    }

    const isSynchronous = body.runSynchronously ?? (body.syncMode?.toUpperCase() === "SYNC");
    const jobId = buildJobId(
      "sync-balance-sheet-actuals",
      body.integrationSourceId,
      body.fiscalYear ?? "CURRENT",
      body.propertyIds?.join("_") ?? "ALL",
      Date.now()
    );

    await logger.info(`Received Balance Sheet Actuals sync request (FY: ${body.fiscalYear ?? "CURRENT"}, ${propCount} properties, syncMode: ${isSynchronous ? "SYNC" : "QUEUE"})`, {
      action: "SYNC_BS_ACTUALS_REQUEST",
      entityName: "BalanceSheetActuals",
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      contextJson: {
        fiscalYear: body.fiscalYear,
        propertiesCount: propCount,
        runSynchronously: isSynchronous,
        autoStage: body.autoStage ?? true,
        autoTransform: body.autoTransform ?? true,
        autoProject: body.autoProject ?? true,
      }
    });

    if (isSynchronous) {
      try {
        const result = await syncEntrataBalanceSheetActualsJob({
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "BalanceSheetActuals",
          ...(body.fiscalYear !== undefined ? { fiscalYear: body.fiscalYear } : {}),
          ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
          ...(body.ownerFilter ? { ownerFilter: body.ownerFilter } : {}),
          ...(body.glTreeId ? { glTreeId: body.glTreeId } : {}),
          glBookId: body.glBookIds?.[0] ?? 1909,
          accountingMethod: body.accountingMethod ?? "accrual",
          ...(body.trailingPeriods !== undefined ? { trailingPeriods: body.trailingPeriods } : {}),
          autoStage: body.autoStage ?? true,
          autoTransform: body.autoTransform ?? true,
          autoProject: body.autoProject ?? true,
          runSynchronously: true,
        });

        await logger.info(`Synchronous Balance Sheet sync completed [syncRunId=${result.syncRunId}, success=${result.successfulCount}/${result.propertyCount}]`, {
          action: "SYNC_BS_ACTUALS_COMPLETED",
          entityName: "BalanceSheetActuals",
          companyId: body.companyId,
          syncRunId: result.syncRunId,
          contextJson: {
            successfulCount: result.successfulCount,
            failedCount: result.failedCount,
          }
        });

        return result;
      } catch (error) {
        await logger.error("Synchronous Balance Sheet sync failed", error, {
          action: "SYNC_BS_ACTUALS_FAILED",
          entityName: "BalanceSheetActuals",
          companyId: body.companyId,
          contextJson: { fiscalYear: body.fiscalYear }
        });
        throw error;
      }
    }

    // Queue mode
    try {
      const job = await syncBalanceSheetActualsQueue.add(
        "sync-balance-sheet-actuals",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "BalanceSheetActuals",
          ...(body.fiscalYear !== undefined ? { fiscalYear: body.fiscalYear } : {}),
          ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
          ...(body.ownerFilter ? { ownerFilter: body.ownerFilter } : {}),
          ...(body.glTreeId ? { glTreeId: body.glTreeId } : {}),
          glBookId: body.glBookIds?.[0] ?? 1909,
          accountingMethod: body.accountingMethod ?? "accrual",
          ...(body.trailingPeriods !== undefined ? { trailingPeriods: body.trailingPeriods } : {}),
          autoStage: body.autoStage ?? true,
          autoTransform: body.autoTransform ?? true,
          autoProject: body.autoProject ?? true,
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
          removeOnComplete: 100,
          removeOnFail: 1000,
          jobId,
        }
      );

      await logger.info(`Successfully enqueued Balance Sheet Actuals sync job [jobId=${job.id}]`, {
        action: "SYNC_BS_ACTUALS_QUEUED",
        entityName: "BalanceSheetActuals",
        jobId: job.id ? String(job.id) : undefined,
        queueName: "sync-balance-sheet-actuals",
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
      });

      return {
        queued: true,
        jobId: job.id ? String(job.id) : undefined,
        entityName: "BalanceSheetActuals",
        stage: "sync",
      };
    } catch (error) {
      await logger.error("Failed to enqueue Balance Sheet Actuals sync job", error, {
        action: "SYNC_BS_ACTUALS_FAILED",
        entityName: "BalanceSheetActuals",
        companyId: body.companyId,
        contextJson: { fiscalYear: body.fiscalYear, jobId }
      });
      throw error;
    }
  }

  @Post("entrata/balance-sheet/stage")
  @ApiBody({ type: StageBalanceSheetActualsRequestDto })
  @ApiOperation({ summary: "Stage Balance Sheet Actuals from raw logs" })
  async stageBalanceSheetActuals(
    @Body() body: StageBalanceSheetActualsRequestDto
  ): Promise<any> {
    const jobId = buildJobId("stage-balance-sheet-actuals", body.syncRunId, Date.now());

    await logger.info(`Received request to stage Balance Sheet Actuals [syncRunId=${body.syncRunId}]`, {
      action: "STAGE_BS_ACTUALS_REQUEST",
      entityName: "BalanceSheetActuals",
      companyId: body.companyId,
      syncRunId: body.syncRunId,
    });

    try {
      const job = await stageBalanceSheetActualsQueue.add(
        "stage-balance-sheet-actuals",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "BalanceSheetActuals",
          syncRunId: body.syncRunId,
          ...(body.reportLogId ? { reportLogId: body.reportLogId } : {}),
          autoTransform: body.autoTransform ?? true,
          autoProject: body.autoProject ?? true,
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 1000,
          jobId,
        }
      );

      return {
        queued: true,
        jobId: job.id ? String(job.id) : undefined,
        entityName: "BalanceSheetActuals",
        stage: "stage",
      };
    } catch (error) {
      await logger.error("Failed to enqueue Balance Sheet Actuals staging job", error, {
        action: "STAGE_BS_ACTUALS_FAILED",
        entityName: "BalanceSheetActuals",
        companyId: body.companyId,
        syncRunId: body.syncRunId,
      });
      throw error;
    }
  }

  @Post("entrata/balance-sheet/transform")
  @ApiBody({ type: TransformBalanceSheetActualsRequestDto })
  @ApiOperation({ summary: "Transform staged Balance Sheet Actuals" })
  async transformBalanceSheetActuals(
    @Body() body: TransformBalanceSheetActualsRequestDto
  ): Promise<any> {
    const jobId = buildJobId("transform-balance-sheet-actuals", body.syncRunId, Date.now());

    await logger.info(`Received request to transform Balance Sheet Actuals [syncRunId=${body.syncRunId}]`, {
      action: "TRANSFORM_BS_ACTUALS_REQUEST",
      entityName: "BalanceSheetActuals",
      companyId: body.companyId,
      syncRunId: body.syncRunId,
    });

    try {
      const job = await transformBalanceSheetActualsQueue.add(
        "transform-balance-sheet-actuals",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "BalanceSheetActuals",
          syncRunId: body.syncRunId,
          autoProject: body.autoProject ?? true,
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 1000,
          jobId,
        }
      );

      return {
        queued: true,
        jobId: job.id ? String(job.id) : undefined,
        entityName: "BalanceSheetActuals",
        stage: "transform",
      };
    } catch (error) {
      await logger.error("Failed to enqueue Balance Sheet Actuals transform job", error, {
        action: "TRANSFORM_BS_ACTUALS_FAILED",
        entityName: "BalanceSheetActuals",
        companyId: body.companyId,
        syncRunId: body.syncRunId,
      });
      throw error;
    }
  }

  @Post("entrata/balance-sheet/project")
  @ApiBody({ type: ProjectBalanceSheetActualsRequestDto })
  @ApiOperation({ summary: "Project Balance Sheet Actuals to budget_calc_lines" })
  async projectBalanceSheetActuals(
    @Body() body: ProjectBalanceSheetActualsRequestDto
  ): Promise<any> {
    const jobId = buildJobId("project-balance-sheet-actuals", body.syncRunId ?? "ALL", Date.now());

    await logger.info(`Received request to project Balance Sheet Actuals`, {
      action: "PROJECT_BS_ACTUALS_REQUEST",
      entityName: "BalanceSheetActuals",
      companyId: body.companyId,
      syncRunId: body.syncRunId,
      contextJson: { propertyId: body.propertyId, fiscalYear: body.fiscalYear }
    });

    try {
      const job = await projectBalanceSheetActualsQueue.add(
        "project-balance-sheet-actuals",
        {
          companyId: body.companyId,
          organisationId: body.organisationId,
          integrationSourceId: body.integrationSourceId,
          entityName: "BalanceSheetActuals",
          ...(body.syncRunId ? { syncRunId: body.syncRunId } : {}),
          ...(body.propertyId ? { propertyId: body.propertyId } : {}),
          ...(body.fiscalYear !== undefined ? { fiscalYear: body.fiscalYear } : {}),
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 1000,
          jobId,
        }
      );

      return {
        queued: true,
        jobId: job.id ? String(job.id) : undefined,
        entityName: "BalanceSheetActuals",
        stage: "project",
      };
    } catch (error) {
      await logger.error("Failed to enqueue Balance Sheet Actuals projection job", error, {
        action: "PROJECT_BS_ACTUALS_FAILED",
        entityName: "BalanceSheetActuals",
        companyId: body.companyId,
        syncRunId: body.syncRunId,
      });
      throw error;
    }
  }

  @Get("sync-runs/:syncRunId/status")
  async getSyncRunStatus(@Param("syncRunId") syncRunId: string) {
    const syncRun = await prisma.integrationSyncRun.findUnique({
      where: { id: syncRunId },
      include: {
        integrationSource: {
          select: { sourceCode: true, sourceType: true }
        }
      }
    });

    if (!syncRun) {
      return {
        success: false,
        message: `SyncRun ${syncRunId} not found.`,
      };
    }

    const propertyRuns = await prisma.integrationPropertyProcessRun.findMany({
      where: { syncRunId },
      orderBy: { updatedAt: "desc" },
    });

    const totalProperties = propertyRuns.length;
    const completed = propertyRuns.filter((p) => p.status === "COMPLETED").length;
    const failed = propertyRuns.filter((p) => p.status === "FAILED").length;
    const processing = propertyRuns.filter((p) => p.status === "PROCESSING").length;
    const queuedOrPending = propertyRuns.filter((p) => p.status === "PENDING" || p.status === "QUEUED").length;

    const percentComplete = totalProperties > 0
      ? Math.round((completed / totalProperties) * 100)
      : (syncRun.status === "COMPLETED" ? 100 : 0);

    const currentlyProcessing = propertyRuns
      .filter((p) => p.status === "PROCESSING")
      .map((p) => ({
        propertyCode: p.propertyCode ?? p.sourcePropertyId,
        propertyId: p.propertyId,
        stage: p.transformStatus ?? "FETCHING",
        startedAt: p.startedAt,
      }));

    const recentCompleted = propertyRuns
      .filter((p) => p.status === "COMPLETED")
      .slice(0, 5)
      .map((p) => ({
        propertyCode: p.propertyCode ?? p.sourcePropertyId,
        actualRowsUpserted: p.actualRowsUpserted,
        calcLinesUpserted: p.calcLinesUpserted,
        completedAt: p.completedAt,
      }));

    const failedProperties = propertyRuns
      .filter((p) => p.status === "FAILED")
      .map((p) => ({
        propertyCode: p.propertyCode ?? p.sourcePropertyId,
        errorMessage: p.errorMessage,
      }));

    return {
      success: true,
      syncRunId: syncRun.id,
      entityName: syncRun.entityName,
      status: syncRun.status,
      startedAt: syncRun.startedAt,
      completedAt: syncRun.completedAt,
      progress: {
        totalProperties,
        completed,
        processing,
        queuedOrPending,
        failed,
        percentComplete: `${percentComplete}%`,
      },
      currentlyProcessing,
      recentCompleted,
      failedProperties,
    };
  }

  @Post("entrata/income-statement-actuals/sync-stream")
  @ApiBody({ type: SyncIncomeStatementActualsRequestDto })
  @ApiOperation({ summary: "Sync Income Statement Actuals with chunked live log streaming" })
  async syncIncomeStatementActualsStream(
    @Body() body: SyncIncomeStatementActualsRequestDto,
    @Res() res: ServerResponse
  ) {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    });

    const writeLog = (msg: string) => {
      res.write(`${new Date().toISOString()} ${msg}\n`);
    };

    writeLog(`[INFO] Starting live-stream Income Statement Actuals sync for FY${body.fiscalYear} (forceAll=${body.forceAll ?? false})...`);

    try {
      const result = await syncEntrataIncomeStatementActualsJob({
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        entityName: "IncomeStatementActuals",
        fiscalYear: body.fiscalYear,
        glBookIds: body.glBookIds && body.glBookIds.length > 0 ? body.glBookIds : [1909],
        accountingMethod: body.accountingMethod ?? "accrual",
        periodType: (body.periodType ?? "currentfyr") as any,
        autoProcess: body.autoProcess ?? true,
        updateReforecast: body.updateReforecast ?? false,
        ...(body.reforecastCutoffMonth ? { reforecastCutoffMonth: body.reforecastCutoffMonth } : {}),
        ...(body.propertyIds?.length ? { propertyIds: body.propertyIds } : {}),
        ...(body.latestPostMonth ? { latestPostMonth: body.latestPostMonth } : {}),
        ...(body.glTreeId ? { glTreeId: body.glTreeId } : {}),
        ...(body.ownerFilter ? { ownerFilter: body.ownerFilter } : {}),
        ...(body.forceAll !== undefined ? { forceAll: body.forceAll } : {}),
        ...(body.trailingPeriods !== undefined && body.trailingPeriods !== null
          ? { trailingPeriods: body.trailingPeriods }
          : {}),
        onProgress: (msg: string) => {
          writeLog(msg);
        },
      });

      writeLog(`\n[SUCCESS] Sync completed! SyncRunId: ${result.syncRunId} | Total properties: ${result.propertyCount} | Successful: ${result.successfulCount} | Failed: ${result.failedCount}`);
      if (result.skippedProperties?.length) {
        writeLog(`[INFO] Skipped ${result.skippedProperties.length} properties: ${result.skippedProperties.map(p => p.propertyCode + ' (' + p.reason + ')').join(', ')}`);
      }
      res.end();
    } catch (err: any) {
      writeLog(`\n[ERROR] Sync job encountered an error: ${err.message || String(err)}`);
      res.end();
    }
  }



  @Post("entrata/balance-sheet/sync-stream")
  @ApiBody({ type: SyncBalanceSheetActualsRequestDto })
  @ApiOperation({ summary: "Sync Balance Sheet Actuals with chunked live log streaming" })
  async syncBalanceSheetActualsStream(
    @Body() body: SyncBalanceSheetActualsRequestDto,
    @Res() res: ServerResponse
  ) {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    });

    const writeLog = (msg: string) => {
      res.write(`${new Date().toISOString()} ${msg}\n`);
    };

    const propCount = body.propertyCodes?.length ?? body.propertyIds?.length ?? "ALL";
    writeLog(`[INFO] Starting live-stream Balance Sheet Actuals sync (FY: ${body.fiscalYear ?? "CURRENT"}, properties: ${propCount})...`);

    try {
      const result = await syncEntrataBalanceSheetActualsJob({
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        entityName: "BalanceSheetActuals",
        ...(body.fiscalYear !== undefined ? { fiscalYear: body.fiscalYear } : {}),
        ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
        ...(body.propertyCodes ? { propertyCodes: body.propertyCodes } : {}),
        ...(body.ownerFilter ? { ownerFilter: body.ownerFilter } : {}),
        ...(body.glTreeId ? { glTreeId: body.glTreeId } : {}),
        glBookId: body.glBookIds?.[0] ?? 1909,
        accountingMethod: body.accountingMethod ?? "accrual",
        ...(body.trailingPeriods !== undefined ? { trailingPeriods: body.trailingPeriods } : {}),
        autoStage: body.autoStage ?? true,
        autoTransform: body.autoTransform ?? true,
        autoProject: body.autoProject ?? true,
        runSynchronously: true,
        onProgress: (msg: string) => {
          writeLog(msg);
        },
      });

      writeLog(`\n[SUCCESS] Sync completed! SyncRunId: ${result.syncRunId} | Total properties: ${result.propertyCount} | Successful: ${result.successfulCount} | Failed: ${result.failedCount}`);
      res.end();
    } catch (err: any) {
      writeLog(`\n[ERROR] Sync job encountered an error: ${err.message || String(err)}`);
      res.end();
    }
  }

  @Post("entrata/budget-report/sync-stream")
  @ApiBody({ type: SyncBudgetReportRequestDto })
  @ApiOperation({ summary: "Sync Budget Report with chunked live log streaming" })
  async syncBudgetReportStream(
    @Body() body: SyncBudgetReportRequestDto,
    @Res() res: ServerResponse
  ) {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    });

    const writeLog = (msg: string) => {
      res.write(`${new Date().toISOString()} ${msg}\n`);
    };

    const propCount = body.propertyCodes?.length ?? body.propertyIds?.length ?? "ALL";
    writeLog(
      `[INFO] Starting live-stream Budget Report sync (FY: ${body.fiscalYear ?? "CURRENT"}, properties: ${propCount}, balanceSheetAccounts: ${body.balanceSheetAccounts ?? false})...`
    );

    try {
      const result = await syncEntrataBudgetReportJob({
        companyId: body.companyId,
        organisationId: body.organisationId,
        integrationSourceId: body.integrationSourceId,
        ...(body.fiscalYear !== undefined ? { fiscalYear: body.fiscalYear } : {}),
        ...(body.budgetType ? { budgetType: body.budgetType } : {}),
        ...(body.targetBudgetYear ? { targetBudgetYear: body.targetBudgetYear } : {}),
        ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
        ...(body.propertyCodes ? { propertyCodes: body.propertyCodes } : {}),
        ...(body.balanceSheetAccounts !== undefined ? { balanceSheetAccounts: body.balanceSheetAccounts } : {}),
        ...(body.ownerFilter ? { ownerFilter: body.ownerFilter } : {}),
        ...(body.glTreeId ? { glTreeId: body.glTreeId } : {}),
        ...(body.glBookIds ? { glBookIds: body.glBookIds } : {}),
        ...(body.budgetStatus ? { budgetStatus: body.budgetStatus } : {}),
        ...(body.includeZeroBalance !== undefined ? { includeZeroBalance: body.includeZeroBalance } : {}),
        autoProcess: body.autoProcess ?? true,
        updateFiscalConfig: body.updateFiscalConfig ?? false,
        onProgress: writeLog,
      });

      writeLog(
        `[SUCCESS] Budget Report sync completed: ${result.propertiesSynced}/${result.propertiesFound} properties synced, ${result.stagedCount ?? 0} staged, ${result.transformedCount ?? 0} transformed, ${result.projectedCount ?? 0} projected.`
      );
      res.write(`\n--- RESULT JSON ---\n${JSON.stringify(result, null, 2)}\n`);
      res.end();
    } catch (err: any) {
      writeLog(`[ERROR] Budget Report sync failed: ${err?.message ?? err}`);
      res.end();
    }
  }

  @Post("entrata/budget/sync-stream")
  @ApiBody({ type: SyncBudgetReportRequestDto })
  @ApiOperation({ summary: "Sync Budget Report with chunked live log streaming (alias)" })
  async syncBudgetStreamAlias(
    @Body() body: SyncBudgetReportRequestDto,
    @Res() res: ServerResponse
  ) {
    return this.syncBudgetReportStream(body, res);
  }
}
