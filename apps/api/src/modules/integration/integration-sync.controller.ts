import { Body, Controller, Inject, Optional, Post, Res, Param, Get } from "@nestjs/common";
import type { ServerResponse } from "node:http";
import { ApiBody, ApiOperation } from "@nestjs/swagger";

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
  syncPropertyQueue,
  syncPropertyUnitQueue,
  syncUnitTypeQueue,
  syncBudgetQueue,
  syncGlTreeQueue,
  transformBudgetStagingQueue,
  syncReportDataQueue,
  type SyncIncomeStatementActualsJobData
} from "@budget-integration/integration-core";

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
import { prisma } from "@budget-integration/database";
import { syncPropertyClosings } from "@budget-integration/domain-rent";
import { syncEntrataBudgetReportJob } from "../../../../worker/src/jobs/sync-entrata-budget-report.job.js";
import { stageBudgetReportJob } from "../../../../worker/src/jobs/stage-budget-report.job.js";
import { transformBudgetReportJob } from "../../../../worker/src/jobs/transform-budget-report.job.js";
import { projectBudgetReportJob } from "../../../../worker/src/jobs/project-budget-report.job.js";
import { SyncBalanceSheetActualsRequestDto } from "./dto/sync-balance-sheet-actuals-request.dto.js";
import {
  StageBalanceSheetActualsRequestDto,
  TransformBalanceSheetActualsRequestDto,
  ProjectBalanceSheetActualsRequestDto,
} from "./dto/balance-sheet-actuals-pipeline-request.dto.js";
import { syncEntrataIncomeStatementActualsJob } from "../../../../worker/src/jobs/sync-entrata-income-statement-actuals.job.js";
import { syncEntrataBalanceSheetActualsJob } from "../../../../worker/src/jobs/sync-entrata-balance-sheet-actuals.job.js";
import {
  SendBudgetRequestDto,
  UpdateBudgetRequestDto,
  type SendBudgetResponse
} from "./dto/send-budget-request.dto.js";
import { SendEntrataBudgetsService } from "./services/send-entrata-budgets.service.js";

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

@Controller("integration-sync")
export class IntegrationSyncController {
  private readonly sendEntrataBudgetsService: SendEntrataBudgetsService;

  constructor(
    @Optional()
    @Inject(SendEntrataBudgetsService)
    sendEntrataBudgetsService?: SendEntrataBudgetsService
  ) {
    this.sendEntrataBudgetsService =
      sendEntrataBudgetsService ?? new SendEntrataBudgetsService();
  }

  @Post("entrata/budget-actuals")
  async syncBudgetActuals(
    @Body() body: SyncBudgetActualRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "BudgetActual"
    };
  }

  @Post("entrata/properties")
  async syncProperties(
    @Body() body: SyncPropertiesRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "Property"
    };
  }

  @Post("entrata/property-units")
  async syncPropertyUnits(
    @Body() body: SyncPropertyUnitsRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "PropertyUnit"
    };
  }

  @Post("entrata/unit-types")
  async syncUnitTypes(
    @Body() body: SyncUnitTypesRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "UnitType"
    };
  }

  @Post("entrata/budgets")
  async syncBudgets(
    @Body() body: SyncBudgetRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "Budget"
    };
  }

  @Post("entrata/budgets/transform")
  async transformBudgets(
    @Body() body: TransformBudgetsRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "Budget"
    };
  }

  @Post("entrata/gl-trees")
  async syncGlTrees(
    @Body() body: SyncGlTreeRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "GlTree"
    };
  }

  @Post("entrata/income-statement-actuals/sync")
  @ApiBody({ type: SyncIncomeStatementActualsRequestDto })
  async syncIncomeStatementActuals(
    @Body() body: SyncIncomeStatementActualsRequestDto
  ): Promise<QueueResponse> {
    const jobId = buildJobId(
      "sync-income-statement-actuals",
      body.integrationSourceId,
      body.fiscalYear,
      body.propertyIds?.join("_") ?? "ALL",
      Date.now()
    );


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
      updateReforecast: body.updateReforecast ?? Boolean(body.reforecastCutoffMonth),
      ...(body.reforecastCutoffMonth ? { reforecastCutoffMonth: body.reforecastCutoffMonth } : {}),

      ...(body.propertyIds?.length ? { propertyIds: body.propertyIds } : {}),
      ...(body.latestPostMonth ? { latestPostMonth: body.latestPostMonth } : {}),
      ...(body.glTreeId ? { glTreeId: body.glTreeId } : {}),
      ...(body.ownerFilter ? { ownerFilter: body.ownerFilter } : {}),
      ...(body.forceAll !== undefined ? { forceAll: body.forceAll } : {}),
      ...(body.trailingPeriods !== undefined && body.trailingPeriods !== null
        ? { trailingPeriods: body.trailingPeriods }
        : {}),
    };

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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "IncomeStatementActuals",
      stage: "sync"
    };
  }

  @Post("entrata/income-statement-actuals/stage")
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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "IncomeStatementActuals",
      stage: "stage"
    };
  }

  @Post("entrata/income-statement-actuals/transform")
  async transformIncomeStatementActuals(
    @Body() body: TransformIncomeStatementActualsRequestDto
  ): Promise<QueueResponse> {
    const jobId = buildJobId(
      "transform-income-statement-actuals",
      body.integrationSourceId,
      body.syncRunId,
      Date.now()
    );

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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "IncomeStatementActuals",
      stage: "transform"
    };
  }

  @Post("entrata/income-statement-actuals/project")
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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "IncomeStatementActuals",
      stage: "project"
    };
  }

  @Post("entrata/budget-report/sync")
  @ApiBody({ type: SyncBudgetReportRequestDto })
  async syncBudgetReport(
    @Body() body: SyncBudgetReportRequestDto,
    @Res({ passthrough: true }) res?: ServerResponse
  ) {
    const wantsStream = body.stream || body.syncMode === "STREAM";
    if (wantsStream && res) {
      return this.syncBudgetReportStream(body, res);
    }

    return syncEntrataBudgetReportJob({
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
  }

  @Post("entrata/budget-report/stage")
  async stageBudgetReport(
    @Body() body: StageBudgetReportRequestDto
  ) {
    return stageBudgetReportJob({
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      ...(body.syncRunId ? { syncRunId: body.syncRunId } : {}),
      autoProcess: body.autoProcess ?? true,
    });
  }

  @Post("entrata/budget-report/transform")
  async transformBudgetReport(
    @Body() body: TransformBudgetReportRequestDto
  ) {
    return transformBudgetReportJob({
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      ...(body.syncRunId ? { syncRunId: body.syncRunId } : {}),
      autoProcess: body.autoProcess ?? true,
    });
  }

  @Post("entrata/budget-report/project")
  async projectBudgetReport(
    @Body() body: ProjectBudgetReportRequestDto
  ) {
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

  @Post("entrata/report-data/property_closings")
  async syncPropertyClosings(
    @Body() body: SyncReportDataRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "ReportData"
    };
  }

  @Post("entrata/report-data/box_score")
  async syncBoxScore(
    @Body() body: SyncReportDataRequestDto
  ): Promise<{
    queued: boolean;
    jobId: string | undefined;
    entityName: string;
  }> {
    const job = await syncReportDataQueue.add(
      "sync-entrata-report-data",
      {
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

    return {
      queued: true,
      jobId: job.id ? String(job.id) : undefined,
      entityName: "ReportData"
    };
  }

  @Post("entrata/property-closings")
  async syncPropertyClosingsDirect(
    @Body() body: SyncPropertyClosingsRequestDto
  ): Promise<{
    success: boolean;
    syncedCount: number;
    errors: string[];
  }> {
    return syncPropertyClosings(prisma, {
      companyId: body.companyId,
      organisationId: body.organisationId,
      integrationSourceId: body.integrationSourceId,
      ...(body.propertyIds ? { propertyIds: body.propertyIds } : {}),
    });
  }

  @Post("entrata/send-budgets")
  async sendBudgets(
    @Body() body: SendBudgetRequestDto
  ): Promise<SendBudgetResponse> {
    const service =
      this.sendEntrataBudgetsService ?? new SendEntrataBudgetsService();
    return service.execute(body);
  }

  @Post("entrata/update-budgets")
  async updateBudgets(
    @Body() body: UpdateBudgetRequestDto
  ): Promise<SendBudgetResponse> {
    const service =
      this.sendEntrataBudgetsService ?? new SendEntrataBudgetsService();
    return service.executeUpdate(body);
  }

  // ==============================================================================
  // ENTRATA BALANCE SHEET ACTUALS ENDPOINTS
  // ==============================================================================

  @Post("entrata/balance-sheet/sync")
  @ApiBody({ type: SyncBalanceSheetActualsRequestDto })
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
    const jobId = buildJobId(
      "sync-balance-sheet-actuals",
      body.integrationSourceId,
      body.fiscalYear ?? "CURRENT",
      body.propertyIds?.join("_") ?? "ALL",
      Date.now()
    );
    const isSynchronous = body.runSynchronously ?? (body.syncMode?.toUpperCase() === "SYNC");

    if (isSynchronous) {
      return syncEntrataBalanceSheetActualsJob({
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
      });
    }

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
      stage: "sync",
    };
  }

  @Post("entrata/balance-sheet/stage")
  @ApiBody({ type: StageBalanceSheetActualsRequestDto })
  async stageBalanceSheetActuals(
    @Body() body: StageBalanceSheetActualsRequestDto
  ): Promise<any> {
    const jobId = buildJobId("stage-balance-sheet-actuals", body.syncRunId, Date.now());

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
  }

  @Post("entrata/balance-sheet/transform")
  @ApiBody({ type: TransformBalanceSheetActualsRequestDto })
  async transformBalanceSheetActuals(
    @Body() body: TransformBalanceSheetActualsRequestDto
  ): Promise<any> {
    const jobId = buildJobId("transform-balance-sheet-actuals", body.syncRunId, Date.now());

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
  }

  @Post("entrata/balance-sheet/project")
  @ApiBody({ type: ProjectBalanceSheetActualsRequestDto })
  async projectBalanceSheetActuals(
    @Body() body: ProjectBalanceSheetActualsRequestDto
  ): Promise<any> {
    const jobId = buildJobId("project-balance-sheet-actuals", body.syncRunId ?? "ALL", Date.now());

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
        writeLog(`[INFO] Skipped ${result.skippedProperties.length} properties: ${result.skippedProperties.map((p: any) => p.propertyCode + ' (' + p.reason + ')').join(', ')}`);
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
